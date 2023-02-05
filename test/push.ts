const main = () => {
  // let project_name, secrets, args;

  // args:

  // let package; // Path to the root of docassemble package (eg: /path/to/docassemble-packagename)

  let secrets_file; //Path to secrets file (eg: /path/to/secrets.json
  let secret; // Name of secret to use

  let project; // Docassemble playground project name.  If not specified, files are pushed into the default playground

  let push; // push files in package to playground
  let pull; // pull files in playground to package

  let ddelete; //Delete all files in the playground (if pushing), or in the local package directory tree (if pulling) before doing push/pull

  let files; //Only push/pull specified file(s) to/from playground.  File should be specified as {questions|sources|static|templates|modules}/filename

  let loglevel: 'INFO' | 'WARN' | 'DEBUG' | 'ERROR'; // Set logging level (default: INFO)

  /**
   * variables runtime
   */

  let pathToFolders = {
    questions: '/path/to/questions',
    source: '/path/to/source',
    static: '/path/to/static',
    templates: '/path/to/templates',
    modules: '/path/to/modules',
  };

  let packagename1 = 'docassemble-LLAW33012020S2P06'; // from path/ro/docassemble-LLAW33012020S2P06
  let packagename2 = 'LLAW33012020S2P06';
  let payload = {
    files: ['path/to/files in questions folder'],
    folder: 'questions',
    URL: 'https://dev.dll.org.au/da/api/playground',
    key: 'TvhvsNfzJ1LEJfgJuqUpzxluJSByJBaR',
    project: 'LLAW33012020S2P06',
  };
};

main();
