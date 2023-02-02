import execa from 'execa';
import { Listr } from 'listr2';

const tasks = new Listr([], { concurrent: false });

tasks.run().catch((err) => {
  console.error(err);
});
