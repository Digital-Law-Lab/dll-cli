#!/usr/bin/env node

/**
 * DESCRIBTION:
 *
 * * A CLI tool to push local Docassemble packages to a specific
 * * remote playground.
 *
 * APPROACH
 *
 * * It currently runs in a child process a python script written by @mferrare <https://github.com/mferrare>
 *
 * @author Sirage Tarakji
 */

import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { outputJson, pathExists, readJson, remove } from 'fs-extra/esm';

import { Listr } from 'listr2';
import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import hyperlinker from 'hyperlinker';
import { search } from 'fast-fuzzy';
import inquirer, { Answers } from 'inquirer';
import autoComplete from 'inquirer-autocomplete-prompt';

import {
  getDirectoriesRecursive,
  delay,
  isEmpty,
  containsWhitespace,
  getCurrentDirsOnce,
} from './utilities.js';
import {
  APIKeyObject,
  APIKeyQuestion,
  inquirerLooperObject,
  TaskFunc,
} from './types/index.js';
import Choice from 'inquirer/lib/objects/choice.js';

//  Register InquirerJS plugins
inquirer.registerPrompt('autocomplete', autoComplete);

// Current directory
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const __cwd = process.cwd();

const configFileName = 'dll.config.json';
const pathToConfigFile = path.join(__cwd, 'dll_config');
const configFileFullPath = path.join(pathToConfigFile, configFileName);

// Conditions
let configFileExists = await pathExists(configFileFullPath);

let jsonProjectNames: string[],
  jsonApiKeyNames: string[],
  jsonApiKeys: Map<string, APIKeyObject>,
  jsonApiKeysObject: { [key: string]: APIKeyObject };
const getValuesFromConfig = async () => {
  try {
    const configFileJson = await readJson(configFileFullPath);
    jsonProjectNames = configFileJson.DA_playground_projects;
    jsonApiKeysObject = configFileJson.API_keys;
    jsonApiKeys = new Map(Object.entries(jsonApiKeysObject));
    jsonApiKeyNames = Array.from(jsonApiKeys.keys());
  } catch (error) {
    console.log(error);
  }
};

if (configFileExists) {
  // grab api key and project names from the config file
  await getValuesFromConfig();
}

let answers_CreateConfig: {
  wantToCreateConfigFile: boolean;
} & APIKeyQuestion;
let answers_playground: { projectName: string };
let answers_moreProjectNames;

if (!configFileExists) {
  // Create a configuration file for the current project if wanted

  const apiKeyQuestions = [
    {
      name: 'apiKey',
      message: `What is the API key? ${chalk.grey(
        '(see ' +
          hyperlinker(
            '#docassemble-api-key',
            'https://github.com/Digital-Law-Lab/Digital-Law-Lab/wiki/Setting-Up#docassemble-api-key'
          ) +
          ')'
      )}`,

      validate(_value: string) {
        return isEmpty(_value)
          ? chalk.yellowBright('API key cannot be empty')
          : true;
      },
    },
    {
      name: 'apiKeyName',
      message: `What would you like to call this API key?`,
      default: 'dev_api_key',
    },
    {
      name: 'apiRoot',
      message: `What is the API endpoint url?`,
      type: 'list',
      default: 'https://dev.dll.org.au/da/api',
      choices: [
        'https://dev.dll.org.au/da/api',
        'https://app.dll.org.au/da/api',
      ],
    },
  ];
  answers_CreateConfig = await inquirer.prompt(
    [
      {
        name: 'wantToCreateConfigFile',
        message: `We couldn't locate a ${chalk.yellowBright.bold(
          configFileName
        )} file for this project, would you like to create one?`,
        type: 'confirm',
      },
      ...apiKeyQuestions.map((_question) => ({
        ..._question,
        when(_answersHash: Answers) {
          return _answersHash.wantToCreateConfigFile;
        },
      })),

      false && {
        //TODO: custom save location for config (current or parent?)
        name: 'configFileLocation',
        message: 'Where would you like to save your configuration file?',
        type: 'autocomplete',
        loop: false,
        suggestOnly: false,
        when(_answersHash: Answers) {
          return _answersHash.wantToCreateConfigFile;
        },
        source: () => {
          return getDirectoriesRecursive(__cwd, {
            type: 'directory',
            includeCurrentDir: true,
            depthLimit: 3,
            currentDirText: `Current Directory [${__cwd}]`,
          });
        },
      },
    ].filter(Boolean)
  );

  const inquirerLooper = async (
    looperObject: inquirerLooperObject
  ): Promise<{ [key: string]: any }[]> => {
    // ask the question/s to figure whether we should loop over `questions` or not
    const _shouldLoobAnswers = await inquirer.prompt(
      looperObject.shouldLoopQuestion
    );

    // check if the answers we got satisfy the loop condition
    if (looperObject.loopCondition(_shouldLoobAnswers)) {
      // return an array of answerHash object for each iteration of sub questions, excluding the answers from shouldLoopQuestion
      return [
        await inquirer.prompt(looperObject.questions),
        ...(await inquirerLooper(looperObject)),
      ];
      //
    } else {
      return [];
    }
  };

  if (answers_CreateConfig.wantToCreateConfigFile) {
    // ask user if want to add another key only if they want to create a config file
    let answers_moreKeys = await inquirerLooper({
      shouldLoopQuestion: {
        name: 'wantToAddMoreKeys',
        message: 'Add another key?',
        type: 'confirm',
        default: false,
      },
      loopCondition: (_shouldLoopAnswers) =>
        _shouldLoopAnswers.wantToAddMoreKeys,
      questions: apiKeyQuestions.map((_question) => {
        if (_question.name == 'apiKeyName') {
          return { ..._question, default: 'production_api_key' };
        }
        return _question;
      }),
    });

    const playgroundProjectNameQuestions = [
      {
        name: 'projectName',
        message: 'What is the name of your DA playground project?',
        type: 'autocomplete',
        loop: false,
        suggestOnly: false,
        emptyText: 'Searching for options as you type',
        source: (_: Answers, input: string): string[] | Promise<string[]> => {
          if (isEmpty(input)) return [];

          return new Promise(async (resolve) => {
            const _currentDir = await getCurrentDirsOnce(__cwd, {
              type: 'directory',
              baseOnly: true,
            });
            const fuzzySearchResult = await search(input, _currentDir);
            resolve([...fuzzySearchResult, 'Something else..']);
          });
        },
        validate(_choice: Choice) {
          if (_choice.value == 'Something else..') return true;
          if (!/^(?:[a-z]|[A-Z]|-|[0-9])+$/.test(_choice.value))
            return chalk.yellowBright(
              'Project name must only contain letters, numbers, or hyphens, without any space'
            );

          if (isEmpty(_choice.value))
            return chalk.yellowBright('Project name cannot be empty');

          return true;
        },
      },
      {
        name: 'projectName',
        message: 'Please type the name of your DA playground projec:',
        askAnswered: true,
        when: (_answersHash: Answers) => {
          return _answersHash.projectName === 'Something else..';
        },
        validate(_input: string) {
          if (!/^(?:[a-z]|[A-Z]|-|[0-9])+$/.test(_input))
            return chalk.yellowBright(
              'Project name must only contain letters, numbers, or hyphens, without any space'
            );

          if (isEmpty(_input))
            return chalk.yellowBright('Project name cannot be empty');

          return true;
        },
      },
    ];

    answers_playground = await inquirer.prompt([
      ...playgroundProjectNameQuestions,
    ]);

    answers_moreProjectNames = await inquirerLooper({
      shouldLoopQuestion: {
        name: 'wantToAddMoreNames',
        message: 'Add another playground project name?',
        type: 'confirm',
        default: false,
      },
      loopCondition: (_shouldLoopQuestion) =>
        _shouldLoopQuestion.wantToAddMoreNames,
      questions: [],
    });

    console.log(
      `Your configuration file will be saved at \`${path.join(
        '.',
        'config',
        'dll.config.json'
      )}\``
    );

    await delay(400);

    const spinner = ora(`${chalk.blue('CREATING')} dll.config.json`).start();

    let constructedConfig: {
      API_keys: { [key: string]: APIKeyObject };
      DA_playground_projects: string[];
    } = {
      API_keys: {},
      DA_playground_projects: [answers_playground.projectName],
    };

    constructedConfig.API_keys[answers_CreateConfig.apiKeyName] = {
      api_key: answers_CreateConfig.apiKey,
      api_root: answers_CreateConfig.apiRoot,
    };

    // user added more than one API key
    if (answers_moreKeys.length > 0) {
      answers_moreKeys.forEach((_answersHash) => {
        constructedConfig.API_keys[_answersHash.apiKeyName] = {
          api_key: _answersHash.apiKey,
          api_root: _answersHash.apiRoot,
        };
      });
    }

    if (answers_moreProjectNames.length > 0) {
      answers_moreProjectNames.forEach((_answersHash) => {
        constructedConfig.DA_playground_projects.push(_answersHash.projectName);
      });
    }

    try {
      // TODO: currently it create config file in the current node directory, add option to select save location (current dir or parent dir) - the question already exists but not implemented below
      await outputJson(configFileFullPath, constructedConfig, { spaces: 2 });

      // add a .gitignore file so that the api key is not accidentally pushed to GitHub
      // TODO: don't add if line already exists in file
      await appendFile(
        path.join(__cwd, '.gitignore'),
        '\n# Digital Law Lab Config\ndll_config/**'
      );

      spinner.succeed(`${chalk.blue('CREATED')} dll.config.json successfully`);

      // config file created, so set to true and populated required vars
      configFileExists = true;
      getValuesFromConfig();
    } catch (error) {
      spinner.fail(chalk.redBright('FAILED') + ' to create config file');
      console.error(error);
      process.exit(1);
    }
    await delay(400);
  }
}

let questions_PushToDA = [
  configFileExists && {
    name: 'playgroundProject',
    message: 'Which playground project do you want to push to?',
    type: 'autocomplete',
    loop: false,
    suggestOnly: false,
    source: () => Promise.resolve([...jsonProjectNames, 'A new one..']),
  },
  {
    name: 'playgroundProject',
    message: 'What is the name of your DA playground project?',
    type: 'autocomplete',
    when: (_answersHash: Answers) => {
      return configFileExists
        ? _answersHash.playgroundProject == 'A new one..'
        : !answers_CreateConfig?.wantToCreateConfigFile;
    },
    loop: false,
    suggestOnly: false,
    askAnswered: true,
    emptyText: 'Searching for options as you type',
    source: (_: Answers, input: string): string[] | Promise<string[]> => {
      if (isEmpty(input)) return [];

      return new Promise(async (resolve) => {
        const _currentDir = await getCurrentDirsOnce(__cwd, {
          type: 'directory',
          baseOnly: true,
        });
        const fuzzySearchResult = await search(input, _currentDir);
        resolve([...fuzzySearchResult, 'Something else..']);
      });
    },

    validate(_choice: Choice) {
      if (_choice.value == 'Something else..') return true;
      if (!/^(?:[a-z]|[A-Z]|-|[0-9])+$/.test(_choice.value))
        return chalk.yellowBright(
          'Project name must only contain letters, numbers, or hyphens, without any space'
        );

      if (isEmpty(_choice.value))
        return chalk.yellowBright('Project name cannot be empty');

      return true;
    },
  },
  {
    name: 'playgroundProject',
    message: 'Please type the name of your DA playground projec:',
    askAnswered: true,
    when: (_answersHash: Answers) => {
      return _answersHash.playgroundProject === 'Something else..';
    },
    validate(_input: string) {
      if (!/^(?:[a-z]|[A-Z]|-|[0-9])+$/.test(_input))
        return chalk.yellowBright(
          'Project name must only contain letters, numbers, or hyphens, without any space'
        );

      if (isEmpty(_input))
        return chalk.yellowBright('Project name cannot be empty');

      return true;
    },
  },
  configFileExists && {
    name: 'apiKeyName',
    message: `You have more than one API key in your config file, which one would you like to use?`,
    type: 'list',
    loop: false,
    choices: () => [...jsonApiKeyNames, 'A new key..'],
    when() {
      return jsonApiKeyNames.length > 1;
    },
  },
  configFileExists && {
    name: 'apiKeyNameConfirm',
    message: `Do you want to use ${chalk.yellow(
      jsonApiKeyNames[0]
    )} as your API key`,
    type: 'confirm',
    when() {
      return jsonApiKeyNames.length == 1;
    },
  },
  {
    // TODO: add ability to save new key if config exists
    name: 'apiKey',
    message: `What is the API key? (not the name)`,
    when(_answersHash: Answers) {
      let userWantsToAddNewKey =
        (typeof _answersHash.apiKeyNameConfirm !== 'undefined' &&
          !_answersHash.apiKeyNameConfirm) ||
        _answersHash.apiKeyName == 'A new key..';

      return configFileExists ? userWantsToAddNewKey : true;
    },
    validate(_value: string) {
      if (isEmpty(_value)) return chalk.yellowBright('API key cannot be empty');
      if (containsWhitespace(_value))
        return chalk.yellowBright(
          'API key must not contain any whitespace character'
        );
      return true;
    },
  },
  {
    name: 'apiRoot',
    message: 'What is the API root url?',
    type: 'list',
    default: 'https://dev.dll.org.au/da/api',
    choices: ['https://dev.dll.org.au/da/api', 'https://app.dll.org.au/da/api'],
    when(_answersHash: Answers) {
      let userWantsToAddNewKey =
        (typeof _answersHash.apiKeyNameConfirm !== 'undefined' &&
          !_answersHash.apiKeyNameConfirm) ||
        _answersHash.apiKeyName == 'A new key..';

      return configFileExists ? userWantsToAddNewKey : true;
    },
  },
  {
    name: 'folderPath',
    message: 'Which folder do you want to push to the playground?',
    type: 'autocomplete',
    loop: false,
    suggestOnly: false,
    source: () => {
      return getDirectoriesRecursive(__cwd, {
        includeCurrentDir: true,
        currentDirText: `Current folder [${__cwd}]`,
      });
    },
    filter(input: string) {
      if (input.includes('Current folder'))
        return String(input.split(/\[|\]/)[1]);
      return path.join(__cwd, input);
    },
  },
].filter(Boolean);

const answers_PushToDA = await inquirer.prompt(questions_PushToDA);

if (answers_PushToDA.apiKey) {
  // TODO: update existing configuration file if user provides new api key not listed in the existing configuration and did not say they don't want to save the new key or create a configuration file (if they don't already have one)
  // addApiKey(apiName, apiKey, apiRoot, apiObject) -> modified object
  // modifyJsonFile(filePath, modifiedObject )
}

// whether user already had an api key stored and they wanted to add another
const userAddedNewKey = configFileExists
  ? answers_PushToDA.apiKeyName === 'A new key..' ||
    (typeof answers_PushToDA.apiKeyNameConfirm !== 'undefined' &&
      !answers_PushToDA.apiKeyNameConfirm)
  : true;

if (userAddedNewKey) {
  // TODO: allow user to save their new key to an existing configuration file, then we will not need this if they save it
  // user added a new key so there is no name and so will use a temprory one
  answers_PushToDA.apiKeyName = 'dll_api_key';
  // apiKey and apiRoot should already be set by user input
}
// use the api found in the configuration
if (!userAddedNewKey && configFileExists) {
  // user wants to use the first api found the in config
  if (answers_PushToDA.apiKeyNameConfirm) {
    answers_PushToDA.apiKeyName = jsonApiKeyNames[0];
  }
  // otherwise the keyName is already set by user from the options that were displayed

  // get the key and root for the api name in the configuration
  answers_PushToDA.apiKey = jsonApiKeys.get(
    answers_PushToDA.apiKeyName
  ).api_key;
  answers_PushToDA.apiRoot = jsonApiKeys.get(
    answers_PushToDA.apiKeyName
  ).api_root;
}

/**
 * Python Script Section
 */

type PythonTaskCtx = {
  warningEncountered?: boolean;
  warningMsg?: string;
  pythonScriptDoneWithoutExpectedErr?: boolean;
  debugEncountered?: boolean;
  debugMsg?: string;
};

const getPythonPath = () =>
  process.platform != 'win32' ? 'python3' : 'python';

const checkingPythonInstallationTitle = 'Checking python installation';
// make sure python is installed and accessible in CLI
const checkingPythonInstallationCallback: TaskFunc<PythonTaskCtx> = (
  ctx,
  task
) =>
  new Promise((resolve, reject) => {
    execa(getPythonPath(), ['--version'])
      .then((log) => {
        task.title = chalk.greenBright(checkingPythonInstallationTitle);
        task.output = `${log.stdout} was found`;
        resolve('Python was found');
      })
      .catch((err) => {
        task.title = chalk.redBright(checkingPythonInstallationTitle);
        task.output =
          "Couldn't run python, make sure it is installed and accessible!";

        reject(new Error(err.message));
      });
  });

// temporarily create a secrets.json file then remove (required because python script expect a path to the file and not just the key)
const tempSecretsJsonPath = path.join(__cwd, 'dll_config', 'secrets.json');
const createTempSecretsJsonFileTitle = 'Creating a temporary `secrets.json`';
const createTempSecretsJsonFileCallback: TaskFunc<PythonTaskCtx> = (
  ctx,
  task
) =>
  new Promise((resolve, reject) => {
    let tempApiKeysObj: { [key: string]: APIKeyObject } = {};

    // use the key and root chosen by the user during the questionnaire
    tempApiKeysObj[answers_PushToDA.apiKeyName] = {
      api_key: answers_PushToDA.apiKey,
      api_root: answers_PushToDA.apiRoot,
    };

    outputJson(tempSecretsJsonPath, tempApiKeysObj, { spaces: 2 })
      .then(() => {
        task.title = chalk.greenBright(createTempSecretsJsonFileTitle);
        task.output = `File created successfully`;
        resolve('Created successfully');
      })
      .catch((error) => {
        reject(new Error(error));
      });
  });

const deleteTempSecretsJsonFileTitle = 'Cleaning up temporary residules';
const deleteTempSecretsJsonFileCallback: TaskFunc<PythonTaskCtx> = (_, task) =>
  new Promise((resolve, reject) => {
    // will run python script then delete file
    remove(tempSecretsJsonPath)
      .then(() => {
        task.title = chalk.greenBright(deleteTempSecretsJsonFileTitle);
        task.output = '';
        resolve('File deleted successfully');
      })
      .catch((error) => reject(error));
  });

const pythonPlaygroundManagerPath = path.join(
  __dirname,
  'python-scripts',
  'docassemble_playground_manager.py'
);
const runPythonPlaygroundManagerScriptTitle =
  'Running `docassemble_playground_manager.py`';
const runPythonPlaygroundManagerScriptCallback: TaskFunc<PythonTaskCtx> = (
  ctx,
  task
) =>
  new Promise((resolve, reject) => {
    execa(getPythonPath(), [
      pythonPlaygroundManagerPath,
      '--secrets_file',
      tempSecretsJsonPath,
      '--secret',
      answers_PushToDA.apiKeyName,
      '--push',
      '--project',
      answers_PushToDA.playgroundProject,
      '--package',
      answers_PushToDA.folderPath,
      // '--loglevel',
      // 'DEBUG',
    ])
      .then((log) => {
        if (!isEmpty(log.stderr)) {
          // manually handle errors and warnings thrown by the script
          if (log.stderr.includes('DEBUG')) {
            task.title = chalk.redBright(
              runPythonPlaygroundManagerScriptTitle + '[DEBUG]'
            );
            ctx.debugEncountered = true;
            ctx.debugMsg = log.stderr;
          }
          if (log.stderr.includes('ERROR')) {
            task.title = chalk.redBright(
              runPythonPlaygroundManagerScriptTitle + '[ERROR]'
            );
            reject(log);
          }
          if (log.stderr.includes('WARNING')) {
            ctx.warningEncountered = true;
            ctx.warningMsg = log.stderr;
            task.title = chalk.yellowBright(
              runPythonPlaygroundManagerScriptTitle + '[WARNING]'
            );
          } else {
            // unhandled log on stderr stream, just output to user
            task.output = log.stderr;
          }
        } else {
          task.output = log.stdout;
        }
        ctx.pythonScriptDoneWithoutExpectedErr = true;
        resolve('Done');
      })
      .catch((err) => {
        task.title = chalk.redBright(
          'Running `docassemble_playground_manager.py`'
        );
        task.output = 'Failed to run the script';
        reject(err.message);
      });
  });

const pythonTasks = new Listr<PythonTaskCtx>(
  [
    {
      title: checkingPythonInstallationTitle,
      task: checkingPythonInstallationCallback,
      options: { persistentOutput: true },
    },
    {
      title: createTempSecretsJsonFileTitle,
      task: createTempSecretsJsonFileCallback,
      options: { persistentOutput: true },
    },
    {
      title: runPythonPlaygroundManagerScriptTitle,
      task: runPythonPlaygroundManagerScriptCallback,
      options: { persistentOutput: true, bottomBar: Infinity },
    },
    {
      title: deleteTempSecretsJsonFileTitle,
      enabled: (ctx) => !!ctx.pythonScriptDoneWithoutExpectedErr,
      task: deleteTempSecretsJsonFileCallback,
      options: { persistentOutput: true },
    },
  ],
  { concurrent: false, rendererOptions: { showErrorMessage: false } }
);

try {
  const pythonTasksResponsCtx = await pythonTasks.run();
  if (
    pythonTasksResponsCtx.warningEncountered ||
    pythonTasksResponsCtx.debugEncountered
  ) {
    console.group();
    console.group();
    if (pythonTasksResponsCtx.debugEncountered) {
      console.log(pythonTasksResponsCtx.debugMsg);
    } else {
      console.warn(pythonTasksResponsCtx.warningMsg);
    }
    console.groupEnd();
    console.groupEnd();
  }
} catch (error) {
  // unexpected error occured, log then exit
  console.group();
  console.group();
  console.error(error);
  console.groupEnd();
  console.groupEnd();

  process.exit(1);
}

/**
 * pushing folders animation
 */

// run the puthon script to push to the playground
// show a progress of the files being pushed
// const filesToPush = await getDirectoriesRecursive(answers_PushToDA.folderPath, {
//   type: 'both',
// });

// const spinnerPushing = ora('Pushing files').start();

// for (const file of filesToPush) {
//   await delay(100);
//   spinnerPushing.text = `Pushing ${file}`;
// }
// spinnerPushing.succeed('Files pushed successfully!');
