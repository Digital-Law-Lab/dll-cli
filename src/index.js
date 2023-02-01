#!/usr/bin/env node

import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { outputJson, pathExists, readJson, remove } from 'fs-extra/esm';
import { PythonShell } from 'python-shell';

import chalk from 'chalk';
import ora from 'ora';
import hyperlinker from 'hyperlinker';
import { search } from 'fast-fuzzy';
import inquirer from 'inquirer';
import autoComplete from 'inquirer-autocomplete-prompt';

import {
  getDirectoriesRecursive,
  delay,
  isEmpty,
  containsWhitespace,
  getCurrentDirsOnce,
} from './utilities.js';

//  Register InquirerJS plugins
inquirer.registerPrompt('autocomplete', autoComplete);

// Current directory
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const __cwd = process.cwd();
const log = console.log;

const configFileName = 'dll.config.json';
const pathToConfigFile = path.join(__cwd, 'dll_config');
const configFileFullPath = path.join(pathToConfigFile, configFileName);

const configFileExists = await pathExists(configFileFullPath);

// try {
//   const ddir = await getDirectoriesRecursive(__cwd, {
//     baseOnly: false,
//     includeCurrentDir: true,
//   });
//   log(ddir);
// } catch (error) {
//   log(error);
// }

// grab api key and project names from the config file
let jsonProjectNames, jsonApiKeyNames, jsonApiKeys, jsonApiKeysObject;
if (configFileExists) {
  try {
    const configFileJson = await readJson(configFileFullPath);
    jsonProjectNames = configFileJson.DA_playground_projects;
    jsonApiKeysObject = configFileJson.API_keys;
    jsonApiKeys = new Map(Object.entries(jsonApiKeysObject));
    jsonApiKeyNames = Array.from(jsonApiKeys.keys());
  } catch (error) {
    console.log(error);
  }
}

// Create a configuration file for the current project if wanted
let answers_CreateConfig;
if (!configFileExists) {
  answers_CreateConfig = await inquirer.prompt(
    [
      {
        name: 'wantToCreateConfigFile',
        message: `We couldn't locate a ${chalk.yellowBright.bold(
          configFileName
        )} file for this project, would you like to create one?`,
        type: 'confirm',
      },
      {
        name: 'API_key',
        message: `What is the Docassemble API key? ${chalk.grey(
          '(see ' +
            hyperlinker(
              '#docassemble-api-key',
              'https://github.com/Digital-Law-Lab/Digital-Law-Lab/wiki/Setting-Up#docassemble-api-key'
            ) +
            ')'
        )}`,

        validate(_value) {
          return isEmpty(_value)
            ? chalk.yellowBright('API key cannot be empty')
            : true;
        },
        when(_answersHash) {
          return _answersHash.wantToCreateConfigFile;
        },
      },
      {
        name: 'apiKeyName',
        message: `What would you like to call this API key?`,
        default: 'dll_api_key',
        when(_answersHash) {
          return _answersHash.wantToCreateConfigFile;
        },
      },
      {
        name: 'API_root',
        message: `What is the API root url?`,
        default: 'https://llaw3301.achelp.net/api',
        when(_answersHash) {
          return _answersHash.wantToCreateConfigFile;
        },
      },
      {
        name: 'DA_playground_project',
        message: 'What is the name of your DA playground project?',
        when(_answersHash) {
          return _answersHash.wantToCreateConfigFile;
        },
        type: 'autocomplete',
        suggestOnly: true,
        emptyText: 'Searching for suggestions as you type (Tab to select)',
        source: (_, input) => {
          if (isEmpty(input)) return [];

          return new Promise(async (resolve) => {
            const _currentDir = await getCurrentDirsOnce(__cwd, {
              type: 'directory',
              baseOnly: 'true',
            });
            const fuzzySearchResult = search(input, _currentDir);
            resolve(fuzzySearchResult);
          });
        },
        validate(_value) {
          if (!/^(?:[a-z]|[A-Z]|-|[0-9])+$/.test(_value))
            return chalk.yellowBright(
              'Project name must only contain letters, numbers, or hyphens, without any space'
            );

          if (isEmpty(_value))
            return chalk.yellowBright('Project name cannot be empty');

          return true;
        },
      },
      false && {
        //TODO: custom save location for config (current or parent?)
        name: 'configFileLocation',
        message: 'Where would you like to save your configuration file?',
        type: 'autocomplete',
        suggestOnly: false,
        when(_answersHash) {
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

  if (answers_CreateConfig.wantToCreateConfigFile) {
    const spinner = ora(
      `Creating file ${chalk.blue("'dll.config.json'")} `
    ).start();

    let constructedConfig = {
      API_keys: {},
      DA_playground_projects: [answers_CreateConfig.DA_playground_project],
    };

    constructedConfig.API_keys[answers_CreateConfig.apiKeyName] = {
      api_key: answers_CreateConfig.API_key,
      api_root: answers_CreateConfig.API_root,
    };

    try {
      // TODO: currently it create config file in the current node directory, add option to select save location (current dir or parent dir) - the question already exists but not implemented below
      await outputJson(configFileFullPath, constructedConfig, { spaces: 2 });

      // add a .gitignore file so that the api key is not accidentally pushed to GitHub
      // TODO: don't add if line already exists in file
      await appendFile(
        path.join(__cwd, '.gitignore'),
        '\n# Digital Law Lab Config\ndll_config/**'
      );

      await delay(300);
      spinner.succeed(chalk.greenBright('Config file created successfully'));
    } catch (error) {
      spinner.fail(chalk.redBright('Failed to create config file'));
      console.error(error);
      process.exit(1);
    }
    await delay(100);
  }
}

let questions_PushToDA = [
  configFileExists && {
    name: 'playgroundProject',
    message: 'Which playground project do you want to push your code to?',
    type: 'list',
    type: 'autocomplete',
    suggestOnly: false,
    source: () => Promise.resolve([...jsonProjectNames, 'Something else']),
  },
  {
    name: 'customPlaygroundProject',
    message: 'Please type the name of the playground project:',
    when: (_answersHash) => {
      return (
        _answersHash.playgroundProject == 'Something else' ||
        (!answers_CreateConfig?.wantToCreateConfigFile &&
          typeof _answersHash.playgroundProject === 'undefined')
      );
    },
    type: 'autocomplete',
    suggestOnly: true,
    emptyText: 'Searching for suggestions as you type (Tab to select)',
    source: (_, input) => {
      if (isEmpty(input)) return [];

      return new Promise(async (resolve) => {
        const _currentDir = await getCurrentDirsOnce(__cwd, {
          type: 'directory',
          baseOnly: 'true',
        });
        const fuzzySearchResult = search(input, _currentDir);
        resolve(fuzzySearchResult);
      });
    },
    validate(_value) {
      if (!/^(?:[a-z]|[A-Z]|-|[0-9])+$/.test(_value))
        return chalk.yellowBright(
          'Project name must only contain letters, numbers, or hyphens, without any space'
        );

      if (isEmpty(_value))
        return chalk.yellowBright('Project name cannot be empty');

      return true;
    },
  },
  configFileExists && {
    name: 'apiKeyName',
    message: `You have more than one API key name in your config file, which one would you like to use?`,
    type: 'list',
    choices: () => jsonApiKeyNames,
    when() {
      return jsonApiKeyNames.length > 1; //TODO: implement the ability to input  something else
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
  !answers_CreateConfig?.wantToCreateConfigFile && {
    name: 'apiKey',
    message: `What is the API key? (not the name)`,
    when(_answersHash) {
      return !_answersHash.apiKeyNameConfirm && !_answersHash.apiKeyName;
    },
    validate(_value) {
      if (isEmpty(_value)) return chalk.yellowBright('API key cannot be empty');
      if (containsWhitespace(_value))
        return chalk.yellowBright(
          'API key must not contain any whitespace character'
        );
      return true;
    },
  },
  !answers_CreateConfig?.wantToCreateConfigFile && {
    name: 'apiRoot',
    message: 'What is the API root url?',
    default: 'https://llaw3301.achelp.net/api',
    when(_answersHash) {
      return !_answersHash.apiKeyNameConfirm && !_answersHash.apiKeyName;
    },
  },
  {
    name: 'folderPath',
    message: 'Which folder do you want to push to the playground?',
    type: 'autocomplete',
    suggestOnly: false,
    source: () => {
      return getDirectoriesRecursive(__cwd, {
        includeCurrentDir: true,
        currentDirText: `Current folder [${__cwd}]`,
      });
    },
    filter(input) {
      if (input.includes('Current folder'))
        return String(input.split(/\[|\]/)[1]);
      return path.join(__cwd, input);
    },
  },
].filter(Boolean);

const answers_PushToDA = await inquirer.prompt(questions_PushToDA);

if (answers_PushToDA.apiKey) {
  // addApiKey(apiName, apiKey, apiRoot, apiObject) -> modified object
  // modifyJsonFile(filePath, modifiedObject )
}

const userTypedNewKeyAndRoot =
  answers_PushToDA.apiKeyName === 'A different one' ||
  !answers_PushToDA.apiKeyNameConfirm;

if (userTypedNewKeyAndRoot) {
  // no name provided so set a default one
  answers_PushToDA.apiKeyName = 'dll_api_key';
  // apiKey and apiRoot should already be set
}
// use api found in the configuration
if (!userTypedNewKeyAndRoot && configFileExists) {
  // user wants to use the first api found the in config
  if (answers_PushToDA.apiKeyNameConfirm) {
    answers_PushToDA.apiKeyName = jsonApiKeyNames[0];
  }

  // get the key and root for the first api name in the configuration
  answers_PushToDA.apiKey = jsonApiKeys.get(
    answers_PushToDA.apiKeyName
  ).api_key;
  answers_PushToDA.apiRoot = jsonApiKeys.get(
    answers_PushToDA.apiKeyName
  ).api_root;
}
// get project name from the configuration the user just created
if (!!answers_CreateConfig) {
  answers_PushToDA.playgroundProject =
    answers_CreateConfig.DA_playground_project;
}

//TODO: implement below with python script section
// run the puthon script to push to the playground
// show a progress of the files being pushed
const filesToPush = await getDirectoriesRecursive(answers_PushToDA.folderPath, {
  type: 'both',
});

const spinnerPushing = ora('Pushing files').start();

for (const file of filesToPush) {
  await delay(100);
  spinnerPushing.text = `Pushing ${file}`;
}
spinnerPushing.succeed('Files pushed successfully!');

/**
 * Python Script Section
 */

const pythonVersion = PythonShell.getVersionSync();

log('python version:', pythonVersion);

// temporarily create a secrets.json file then remove (required because python script expect a path to the file and not an object)
const tempSecretsJsonPath = path.join(__cwd, 'secrets.json');
try {
  let tempApiKeysObj = {};
  // config file is found and user want to use it
  if (configFileExists && answers_PushToDA.apiKeyNameConfirm) {
    tempApiKeysObj = jsonApiKeysObject;
  } else {
    // user supplied the key and root, so create a temp name for python script
    answers_PushToDA.apiKeyName = 'dll_api_key';
    let _keyObj = {};
    _keyObj[answers_PushToDA.apiKeyName] = {
      api_key: answers_PushToDA.apiKey,
      api_root: answers_PushToDA.apiRoot,
    };

    tempApiKeysObj = _keyObj;
  }

  await outputJson(tempSecretsJsonPath, tempApiKeysObj, { spaces: 2 });

  // will run python script then delete file
  // await remove(tempSecretsJsonPath);
} catch (error) {
  console.error(error);
}

const pythonPlaygroundManagerPath = path.join(
  __dirname,
  'python-scripts',
  'docassemble_playground_manager.py'
);

try {
  // PythonShell.runString('x=1+1;print(x)', null, function (err) {
  //   if (err) throw err;
  // });

  const pythonScriptOptions = {
    args: [
      '--secrets',
      tempSecretsJsonPath,
      '--secret',
      answers_PushToDA.apiKeyName,
      '--push',
      '--project',
      answers_PushToDA.playgroundProject,
      '--package',
      answers_PushToDA.folderPath,
    ],
  };

  PythonShell.run(
    pythonPlaygroundManagerPath,
    pythonScriptOptions,
    function (err, results) {
      if (err) throw err;
      console.log('finished');
      // results is an array consisting of messages collected during execution
      console.log('results: %j', results);
    }
  );
} catch (err) {
  console.error(err);
  if (err.exitCode == 9009)
    console.error(
      chalk.redBright('Ensure that python is installed and in the PATH')
    );
}
