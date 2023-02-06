> A next-generation CLI for pushing/pulling packages to Docassemble Playground

## 🚀 Features

- Cross-platform

- Cross-shell

- global (or per package) configuration file

- prompt-based (politely asks for required data)

- Elegant

## 🚩 Prerequisite

- [NodeJS](https://nodejs.org/en/download/)

- [Python](https://www.python.org/downloads/)

- [Requests](https://pypi.org/project/requests/) for Python `pip install requests`

## 🚠 Usage

Once you have installed the prerequisite above, you will have two options for using `dll-cli`: Offline, or Online.

### 🌚 Offline

Offline allows you to invoke the CLI faster, but you need to download it to your PC either globally or locally.

If installing local make sure you `cd` to the root folder of your DA packages. Then you can run the command only in that folder.

If you install globally you can run the command anywhere, in your terminal.

```bash
# globally
npm install -g dll-cli

# locally
npm install -D dll-cli
```

### :sun_with_face: Online

Using the tool online is easier, but you will have to temporarily download it every time you want to use it. While this means you always have the latest version, it also means longer wait.

To use the tool "online" just prefix the command with `npx`.

```bash
# Online
npx dll-cli
```

## :muscle: Configuration

The tool looks for a file named `dll.config.json` in the `dll-config` folder in the current working directory (the directory where you execute the command). This allows you to have a global config for all packages, or a local one inside each package.

The config file contains information (such api key, and endpoint) which is needed to push you packages to the right remote playground and ensure proper authentication.

You can of course manually write your config file. However, when you run the tool in a directory that is not configured you will be given the option to have the tool create a config file for you. Like in the example below.
