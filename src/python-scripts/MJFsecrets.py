# Get secrets from a secrets file
# Specify the location of the secrets file
# Specify the parent 'key'.  This should be an identifer
# that identifies the secret requested.  The value of
# each key is a dictionary containing the requested secrets
# Values will be app dependent and must be processed by
# the calling app

import json

class MJFSecrets:
    """
    Synopsis
    --------
    Accesses secrets stored in json-formatted secrets file.  Used
    to access API keys and other confidential iformation

    Description
    -----------
    JSON file should be of format `{ key1: {keya: value1, keyb: value2}, 
    key2: {keyc: value3, keyd: value4}}` and so-on
    """

    # Secrets will be stored in here
    _secrets = None

    def __init__(self, pathToSecrets):
        """
        Synopsis
        --------
        Constructor.  Requires a path to a secrets file.  
        Will raise an error if can't open the file

        Paramters
        ---------
        pathToSecrets : str

        Path to secrets file

        Returns
        -------
        Nothing

        Raises
        ------
        Exception if cannot open pathToSecrets
        TODO: raise a custom exception
        """
        secretsfp = open(pathToSecrets, 'r')    # Raises an exception if can't open
        secrets_string = secretsfp.read()
        self._secrets = json.loads(secrets_string)
        secretsfp.close()

    def getSecret(self, MJFkey):
        """
        Synopsis
        --------
        Returns the dictionary attached to MJFkey in _secrets, otherwise
        returns None

        Parameters
        ----------
        MJFkey : str

        Name of key pointing to secrets

        Returns
        -------
        Dictionary of secrets or None

        Raises
        ------
        Should not raise anything
        """
        try:
            return self._secrets[MJFkey]
        except:
            return None