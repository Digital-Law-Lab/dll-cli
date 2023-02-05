import chalk from 'chalk';
import { execa } from 'execa';
import { Listr } from 'listr2';

type Ctx = {};

const tasks = new Listr<Ctx>(
  [
    {
      title: 'Checking python installation',
      task: (ctx, task) =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            // reject(new Error('Python was not found'));
            execa('python', ['--version'])
              .then((log) => {
                task.title = chalk.greenBright('Checking python installation');
                task.output = `${log.stdout} was found`;
                resolve('Python was found');
              })
              .catch((err) => {
                task.output = chalk.redBright(
                  "Couldn't run python, make sure it is installed and accessible!"
                );

                reject(new Error(err.message));
              });
          }, 50);
        }),
      options: { persistentOutput: true },
    },
    {
      title: 'Creating a temporary `secrets.json`',
      task: (ctx, task) =>
        new Promise((resolve) => {
          setTimeout(() => {
            task.title = chalk.greenBright(
              'Creating a temporary `secrets.json`'
            );
            task.output = `File created successfully`;
            resolve('Created successfully');
          }, 2000);
        }),
      options: { persistentOutput: true },
    },
    {
      title: 'Running `docassemble_playground_manager.py`',
      task: (ctx, task) =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            task.title = chalk.redBright(
              'Running `docassemble_playground_manager.py`'
            );
            task.output = 'Failed to run the script';
            reject(new Error('Script failed'));
          }, 2000);
        }),
      options: { persistentOutput: true },
    },
  ],
  { concurrent: false, rendererOptions: { showErrorMessage: false } }
);

try {
  await tasks.run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
