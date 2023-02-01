# A script that allows an admin to push and pull files from a nominated playground
# Assumptions:
# - push/pull files to the current user's playground (ie: user with API key)

import requests, json
import os
from os import listdir
from os.path import isfile, join
import glob
import argparse
import logging
from MJFsecrets import MJFSecrets

#
# Global variables
args = None                     # Parser arguments are stored here
secrets = None                  # Instance of MJFsecrets class
project_name = None             # Where to store project if defined

# List of folders to iterate through.  This list comes from the
# API documentation: https://docassemble.org/docs/api.html#playground_get
QUESTIONS_FOLDER = 'questions'
SOURCES_FOLDER   = 'sources'
STATIC_FOLDER    = 'static'
TEMPLATES_FOLDER = 'templates'
MODULES_FOLDER   = 'modules'
project_folders = [
    QUESTIONS_FOLDER,
    SOURCES_FOLDER,
    STATIC_FOLDER,
    TEMPLATES_FOLDER,
    MODULES_FOLDER
]


def push_to_playground(MJFpayload):
    """
    Synopsis
    --------
    Pushes files specified in the payload to the Playground

    Parameters
    ----------
    MJFpayload : dict

    HTTP POST payload.  Contains list files in 'files' key which are extracted
    and sent as part of the multipart POST request

    Returns
    -------
    Nothing

    Raises
    ------
    Exception raised if request not successful
    """

    # Initialise    
    construct_API_payload(MJFpayload)

    # create the list of multiple files
    file_payload = []
    for file in MJFpayload['files']:
        file_payload.append(
            ('files', open(file, 'rb'))
        )
    del MJFpayload['files']
    logging.debug('Push payload: {}'.format(MJFpayload))
    logging.debug('File payload: {}'.format(file_payload))
    # Send the file
    response = requests.post(MJFpayload['URL'], data=MJFpayload, files=file_payload)
    response.raise_for_status()

def list_playground_files(MJFpayload):
    """
    Synopsis
    --------
    Lists all files in a particular folder in the playground

    Parameters
    ----------
    `MJFpayload` : `dict` containing at least a `folder` key.  May also contain a 
    `project` key

    Returns
    -------
    List of files

    Raises
    ------
    Raises nothing, at least from http request
    """
    construct_API_payload(MJFpayload)
    response = requests.get(MJFpayload['URL'], params=MJFpayload)

    # If the response code is 200 we're OK.  In which case return the 
    # list of files
    if response.ok:
        return response.json()
    else:
        return []

def list_all_playground_files():
    """
    Synopsis
    --------
    Lists all the files in the `project_folders` in the playground

    Parameters
    ----------
    None

    Returns
    -------
    List of files formatted as `dir/file`
    """
    all_files = []
    for the_dir in project_folders:
        MJFpayload = { 'folder' : the_dir }
        the_files = list_playground_files(MJFpayload)
        for a_file in the_files:
            all_files.append('{}/{}'.format(the_dir, a_file))

    return all_files

def clean_out_playground():
    """
    Synopisis
    ---------
    Deletes all files in the default playground or in the playground project
    if one is specified

    Parameters
    ----------
    None

    Returns
    -------
    Nothing

    Raises
    ------
    Exceptions from requests object is passed up
    """
    for folder in project_folders:
        payload = {}
        payload['folder'] = folder
        the_files = list_playground_files(payload)
        for a_file in the_files:
            payload = {}
            payload['folder'] = folder
            payload['filename'] = a_file
            delete_playground_file(payload)

def delete_playground_file(payload):
    """
    Synopsis
    --------
    Deletes a file (specified in the payload) from the playground

    Parameters
    ----------
    `payload` : `dict` containing `folder` and `filename` keys

    Returns
    -------
    Nothing

    Raises
    ------
    Exception passed from `request`
    """
    construct_API_payload(payload)
    result = requests.delete(payload['URL'], params=payload)
    result.raise_for_status()

def clean_out_local_package():
    """
    Synopsis
    --------
    Deletes all files from the local package.

    Description
    -----------
    'All files' means all files from the questions, static, sources, templates and
    modules directories.  It does not mean every file in the package.

    Lists through every file currently in the local package directory and deletes each one

    Raises
    ------
    Exceptions from os.remove() are passed up
    """
    for folder in project_folders:
        for file in list_local_files(folder):
            os.remove(file)

def construct_API_payload(payload):
    """
    Synopsis
    --------
    Adds standard parameters to payload ie: API endpoint, key
    and project name

    Parameters
    ----------
    payload : dict

    Payload to be passed to HTTP POST or GET request
    
    Returns
    -------
    Nothing.  Keys are added to payload as passed in.
    """

    # Add URL and api key to the payload
    logging.debug('Secrets: {}'.format(secrets))
    payload['URL'] = secrets['api_root'] + '/playground'
    payload['key'] = secrets['api_key']
    # Add a project if we have it
    if args.project:
        payload['project'] = args.project
    logging.debug('Payload: {}'.format(payload))

def get_package_name():
    """
    Synopsis
    --------
    Extracts the package name from args.package.  By The package name is the descriptive
    part of the package ie: for /path/to/docassemble-packageName, 'packageName' will be
    returned

    Paramters
    ---------
    None

    Returns
    -------
    string containing package name
    """
    packagename = os.path.basename(os.path.normpath(args.package))
    logging.debug('packagename 1: {} path: {}'.format(packagename, args.package))
    # trim off the leading 'docassemble-'
    packagename = packagename.replace('docassemble-', '')
    logging.debug('packagename 2: {}'.format(packagename))
    return packagename

def get_path_to_folders():
    """
    Synopsis
    --------
    Gets the path to where the files to be pushed/pulled are.  

    Description
    ------------
    A docassemble package has the structure 
    'docassemble-packageName/docassemble/packageName/data/{questions|templates|static|sources} and
    'docassemble-packageName/docassemble/packageName/*.py for modules.

    See this for more details: https://github.com/Digital-Law-Lab/Digital-Law-Lab/issues/3


    Parameters
    ----------
    None

    Return
    ------
    Dictionary containing path to each folder ie:
    {
        questions : path_to_questions
        templates : path_to_templates
        ...
        modules   : path_to_modules
    }
    """
    result = {}
    # Create a temp array to iterate over non-module folders
    temp = project_folders.copy()
    temp.remove(MODULES_FOLDER)
    for a_path in temp:
        result[a_path] = os.path.join(args.package, 'docassemble/{}/data/{}'.format(get_package_name(), a_path))
        logging.debug('a_path: {}'.format(a_path))
    # Now add path to the modules
    result[MODULES_FOLDER] = os.path.join(args.package, 'docassemble/{}'.format(get_package_name()))

    logging.debug('path_to_folders: {}'.format(result))
    return result

def list_local_files(the_folder):
    """
    Synopsis
    --------
    List all the files in the local package data structure for a specific directory in `project_folders`

    Description
    -----------
    Lists all files in /path/to/docassemble-packageName/docassemble/packageName/data/<project_dirs>, 
    and lists files in /path/to/docassemble-packageName/docassemble/packageName/*.py (for modules)
    
    Parameters
    ----------
    the_folder : str containing an element from `project_folders`

    Returns
    -------
    List of file paths
    """
    # Project folders are in data_dir
    result = []
    data_dirs = get_path_to_folders()
    current_dir = data_dirs[the_folder]
    try:
        if the_folder == MODULES_FOLDER:
            # Include *.py but exclude __init__.py
            file_paths = glob.glob('{}/{}'.format(current_dir, '[!_]*.py'))
        else:
            # Include all files
            file_paths = glob.glob('{}/*'.format(current_dir))

        for a_path in file_paths:
            # Exclude subdirs
            if isfile(a_path):
                result.append(a_path)
    except:
        # Nothing is appended if the directory doesn't exist
        pass

    return result

def list_files_to_push_or_pull(the_folder, list_method):
    """
    Synopsis
    --------
    Prepares a list of files to push to Playground

    Parameters
    ----------
    `the_folder` : str containing an element from `project_folders`

    `list_method` : python method to list files in the local directory or the playground.  Method
    should take no parameters.

    Description
    -----------
    If --files is specified then returns a list of the full path to the specified files
    provided that the files exist in the package.  If --files is not specified then returns
    all of the files in the package to be pushed to the playground

    Returns
    -------
    list of file paths
    """
    if args.files:
        just_the_files = []
        for a_file in args.files:
            # a_file contains eg: 'dir/filename'
            # each file in list_method contains a full path (presumably) to the same 
            # filename.  So, the last two components in the path should match
            a_file = os.path.normpath(a_file)
            a_file_dir, a_file_name = a_file.split(os.sep, 2)

            # Iterate through teh file list.  If each file doesn't match then delete it
            # from the file list
            for b_file in list_method(the_folder):
                b_file = os.path.normpath(b_file)
                b_file_dir, b_file_name = b_file.split(os.sep)[-2:]
                # Account for modules being in a different path
                if the_folder == MODULES_FOLDER:
                    # Directory for storing modules is the project name
                    compare_dir = get_package_name()
                else:
                    # All other files are stored in project_name/data/the_folder
                    compare_dir = a_file_dir

                if b_file_dir == compare_dir and b_file_name == a_file_name:
                    just_the_files.append(b_file)
        return just_the_files
    else:
        return list_method(the_folder)

def do_push():
    """
    Synopsis
    --------
    Push files to the playground

    Descrption
    ----------
    By default will push all the files in the project_folders to the playground.
    - If --files is set, will only push the specified files
    - If --delete is set, then will clean out the playgroud first
    """
    """
    We have the path to the package
    We may have a list of files in the format aaa/bbb
    If files isn't set then list all the files in the package
    If files is set, find only those files.  To that by:
    - split each file specifier into directory and file
    - for each project directory
    """

    if args.delete:
        clean_out_playground()
    
    # Get the list of files to push and add to payload. Iterate over each folder
    # as the folder must be supplied as a parameter to the POST request.
    for folder in project_folders:
        MJFpayload = {}
        MJFpayload['files'] = []
        MJFpayload['folder'] = folder
        MJFpayload['files'] += list_files_to_push_or_pull(folder, list_local_files)
        if len(MJFpayload['files']) > 0:
            try:
                push_to_playground(MJFpayload)
                logging.info('Pushed folder {}'.format(folder))
            except Exception as e:
                logging.error('Could not push folder: {}  Error: {}'.format(folder, str(e)))
        else:
            logging.warning('No files to push for folder: {}'.format(folder))

def do_pull():
    """
    Synopsis
    --------
    Pull files from the playground into the package

    Descrption
    ----------
    By default will pull all the files in the `project_folders` from the playground
    to the local package
    
    - If --files is set, will only push the specified files
    - If --delete is set, then will clean out the local package first
    """

    # Get a list of all files from the playground
    # Will be a list of dir/file
    # Match up against --files if --files exists
    # Delete if delete
    # for each file in the list
    #   construct the root path (/path/to/docassemble-packageName/docassemble/packageName/data)
    #   tack on our dir/file
    #   pull the file down from playground
    #   write to the path - overwrite silently

    # Create a list of all the files in the playground
    
    # logging.error("Don't know how to pull files from the playground yet")
    # return
    # This will all come later
    MJFpayload = {}
    MJFpayload['files'] = list_all_playground_files()

    if args.delete:
        clean_out_local_package()

    # Not pursuing this for now
    logging.info("Pulling files from the Playground is not yet implemented")

def main():
    """Main Program
    """
    global project_name
    global secrets
    global args

    # Process command-line arguments
    parser = argparse.ArgumentParser(description='Push local code to playground')
    parser.add_argument('--package', required=True, help='Path to the top of docassemble package (eg: /path/to/docassemble-packagename)')
    parser.add_argument('--secrets_file', required=True, help='Path to secrets file (eg: /path/to/secrets.json')
    parser.add_argument('--secret', required=True, help='Name of secret to use')
    
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--push', action='store_true', help='Push files in package to playground')
    group.add_argument('--pull', action='store_false', help='Pull files in playground to package')
    
    parser.add_argument('--files', nargs='+', help="Only push/pull specified file(s) to/from playground.  File should be specified as {questions|sources|static|templates|modules}/filename")
    parser.add_argument('--delete', action='store_true', help='Delete all files in the playground (if pushing), or in the local package directory tree (if pulling) before doing push/pull')
    parser.add_argument('--project', help='Docassemble playground project name.  If not specified, files are pushed into the default playground')
    parser.add_argument('--loglevel', default=logging.INFO, choices=['INFO', 'WARN', 'DEBUG', 'ERROR'], help='Set logging level (default: INFO)')
    
    args = parser.parse_args()

    logging.basicConfig(level=args.loglevel)

    # Get the secrets
    secrets = MJFSecrets(args.secrets_file).getSecret(args.secret)
    logging.debug('secrets: {}'.format(secrets))

    if args.project is not None:
        project_name = args.project.strip()
    
    
    # Main branch - push or pull
    if args.push:
        # Then we're pushing
        do_push()
    else:
        do_pull()
    

main()