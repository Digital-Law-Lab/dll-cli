import { lstat, readdir, access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 *
 * @param {string} source
 * @param {boolean} includeFiles
 * @param {boolean} withFileTypes - if false the function will return `string[]` with the file/folder name, otherwise will return `Object[]` with methods like `isDirectory()`.
 * @returns An array of directories within `source` (no subdirectories are traversed), will include files if `includeFiles = true`.
 */
export const getDirectories = async (
  source,
  includeFiles = false,
  withFileTypes = false
) => {
  if ((await lstat(source)).isFile()) return [];
  try {
    return (await readdir(source, { withFileTypes: true }))
      .filter((dirent) =>
        !includeFiles
          ? dirent.isDirectory()
          : dirent.isFile() || dirent.isDirectory()
      )
      .map((dirent) => (withFileTypes ? dirent : dirent.name));
  } catch (error) {
    console.error(error);
    return [];
  }
};

/**
 *
 * @param {string} source required
 * @param {Object} options
 * @param {'file'|'directory'|'both'} options.type whether to show only files, only directories, or both
 * @param {boolean} options.baseOnly if true, will only return base name instead of the path i.e. `folderName` instead of `usr\src\folderName`
 * @param {number} options.depthLimit how deep should the scan be into the subdirectories. Leave as undefined to scan all subdirectories.
 * @param {function} options.excludePath A function that recieves a path and must return a boolean (true to exclude, false to keep)
 * @param {boolean} options.includeCurrentDir whether to show the root directory (the source)
 * @param {string} options.currentDirText what to show as the name of the root directory default is `'.'`.
 * @param {string[]} foundDirList
 * @param {string[]} remainingDirsToSearch
 * @returns An array of directories and subdirectories. It will include files if `type = 'file' or 'all'`.
 */
export const getDirectoriesRecursive = async (
  source,
  options,
  foundDirList = [],
  remainingDirsToSearch = [],
  rootPath,
  level = 1
) => {
  try {
    // set default options
    options = {
      ...{
        type: 'directory',
        baseOnly: false,
        depthLimit: 3,
        excludePath: (_nodePath) =>
          _nodePath.includes('node_modules') || _nodePath.includes('.git'),
        includeCurrentDir: false,
        currentDirText: '.',
      },
      ...options,
    };
    if (!rootPath) rootPath = source;

    console.log('source', source);

    const showFiles = options.type == 'file' || options.type == 'both';

    const dontShowDirectories = options.type == 'file';

    const getCurrentDirectoryToScan = (_directoryList) => {
      let _dirPath, _isDirectory, _depth;
      if (typeof _directoryList[0] === 'string') {
        _dirPath = path.join(source, _directoryList[0]);
        _isDirectory = undefined;
        _depth = undefined;
      }

      if (typeof _directoryList[0] === 'object') {
        // the directory could either be `dirent` object returned by readdir or the object inside `remainingDirsToSearch`.
        // if dirent the path is `source` + base name
        // otherwise it is the original path preformated in `remainingDirsToSearch`.
        _dirPath = !!_directoryList[0].name
          ? path.join(source, _directoryList[0].name)
          : path.join(rootPath, _directoryList[0].path);
        // if dirent use the builtin method `isDirectory()`
        _isDirectory = !!_directoryList[0].name
          ? _directoryList[0].isDirectory()
          : _directoryList[0].isDirectory;
        _depth = !_directoryList[0].name
          ? _directoryList[0].path.split(path.sep).length == 0
            ? 1
            : _directoryList[0].path.split(path.sep).length
          : undefined;
      }

      return {
        path: path.relative(rootPath, _dirPath),
        isDirectory: _isDirectory,
        level: _depth + 1,
      };
    };

    const getFoundDirList = () => {
      let _dirList = !options.baseOnly
        ? foundDirList
        : foundDirList.map((_path) => path.basename(_path));

      if (options.includeCurrentDir)
        _dirList = [options.currentDirText, ..._dirList];

      return Promise.resolve(_dirList);
    };

    let dirs = await getDirectories(source, showFiles, showFiles);

    console.log('dirs', dirs);

    // depth level reached
    if (options.depthLimit === level) {
      foundDirList = [
        ...foundDirList,
        ...dirs
          .map((base) =>
            path.relative(
              rootPath,
              path.join(source, showFiles ? base.name : base)
            )
          )
          .filter((_path) => !options.excludePath(_path)),
      ];

      dirs = [];
    }

    // check if current dir is excluded
    while (
      dirs.length !== 0 &&
      options.excludePath(getCurrentDirectoryToScan(dirs).path)
    ) {
      // current dir is excluded check next in line
      dirs.shift();
    }

    // current dir is empty and no remaining dirs to scan
    if (dirs.length === 0 && remainingDirsToSearch.length === 0)
      return getFoundDirList();

    const currentDirList = dirs.length === 0 ? remainingDirsToSearch : dirs;
    let currentDirToScan = getCurrentDirectoryToScan(currentDirList);
    if (dirs.length !== 0) {
      level += 1;
    } else {
      level = currentDirToScan.level;
    }

    const subPath = path.join(rootPath, currentDirToScan.path);

    // don't include the path if it is a directory and `dontShowDirectories` and `showFiles` are true.
    foundDirList = [
      ...foundDirList,
      ...(dontShowDirectories && showFiles && currentDirToScan.isDirectory
        ? []
        : [currentDirToScan.path]),
    ];

    // if current directory is empty then we are scaning the remaining dirs.
    if (dirs.length === 0) {
      remainingDirsToSearch = remainingDirsToSearch.slice(1);
    } else {
      remainingDirsToSearch = [
        ...dirs.slice(1).map((base) => ({
          path: path.relative(
            rootPath,
            path.join(source, showFiles ? base.name : base)
          ),
          isDirectory: showFiles ? base.isDirectory() : undefined,
        })),
        ...remainingDirsToSearch,
      ];
    }

    return await getDirectoriesRecursive(
      subPath,
      options,
      foundDirList,
      remainingDirsToSearch,
      rootPath,
      level
    );
  } catch (error) {
    console.log(error);
    return [];
  }
};

let alreadyVisitedSource, cachedDirs;
export const getCurrentDirsOnce = async (source, options) => {
  if (alreadyVisitedSource != source) {
    alreadyVisitedSource = source;
    cachedDirs = await getDirectoriesRecursive(source, options);
  }
  return Promise.resolve(cachedDirs);
};

export const delay = (duration = 1000) =>
  new Promise((resolve) => setTimeout(resolve, duration));

export const doesDirExists = (_path) =>
  access(_path)
    .then(() => true)
    .catch(() => false);

export const createFile = async (fileName, content, location) => {
  const _path = path.join(location, fileName);
  if (!(await doesDirExists(location))) {
    await mkdir(location);
  }
  return writeFile(_path, content, 'utf-8');
};

export const isEmpty = (_value) => !_value || /^\s*$/.test(_value);

export const containsWhitespace = (_value) => /\s+/.test(_value);
