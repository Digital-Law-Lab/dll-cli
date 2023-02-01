#!/usr/bin/env node

import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { outputJson, pathExists, readJson } from 'fs-extra/esm';
import { PythonShell } from 'python-shell';

import chalk from 'chalk';
import ora from 'ora';
import hyperlinker from 'hyperlinker';
import { search } from 'fast-fuzzy';
import inquirer from 'inquirer';
import fuzzyPath from 'inquirer-fuzzy-path';
import autoComplete from 'inquirer-autocomplete-prompt';

import {
  getDirectoriesRecursive,
  delay,
  isEmpty,
  containsWhitespace,
  getCurrentDirsOnce,
} from './utilities.js';

//  Register InquirerJS plugins
inquirer.registerPrompt('fuzzypath', fuzzyPath);
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
let jsonProjectNames, jsonApiKeyNames, jsonApiKeys;
if (configFileExists) {
  try {
    const configFileJson = await readJson(configFileFullPath);
    jsonProjectNames = configFileJson.DA_playground_projects;
    jsonApiKeys = new Map(Object.entries(configFileJson.API_keys));
    jsonApiKeyNames = Array.from(jsonApiKeys.keys());
  } catch (error) {
    console.log(error);
  }
}

// Create a configuration file for the current project if wanted
let answers_CreateConfig;
if (!configFileExists) {
  answers_CreateConfig = await inquirer.prompt([
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
      name: 'API_key_name',
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
    {
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
  ]);

  if (answers_CreateConfig.wantToCreateConfigFile) {
    const spinner = ora(
      `Creating file ${chalk.blue("'dll.config.json'")} `
    ).start();

    let constructedConfig = {
      API_keys: {},
      DA_playground_projects: [answers_CreateConfig.DA_playground_project],
    };

    constructedConfig.API_keys[answers_CreateConfig.API_key_name] = {
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

// user want to use api key found first in the configuration
if (answers_PushToDA.apiKeyNameConfirm) {
  answers_PushToDA.apiKeyName = jsonApiKeyNames[0];
}
// get project name from the configuration the user just created
if (!!answers_CreateConfig) {
  answers_PushToDA.playgroundProject =
    answers_CreateConfig.DA_playground_project;
}

// run the puthon script to push to the playground
const filesToPush = await getDirectoriesRecursive(answers_PushToDA.folderPath, {
  type: 'both',
});

const spinnerPushing = ora('Pushing files').start();

for (const file of filesToPush) {
  await delay(100);
  spinnerPushing.text = `Pushing ${file}`;
}
spinnerPushing.succeed('Files pushed successfully!');

PythonShell.runString('x=1+1;print(x)', null, function (err) {
  if (err) throw err;
  console.log('finished');
});
