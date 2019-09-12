import os
import json
from base64 import b64decode

import boto3

warm_secret = None
def kms_decrypt(secretName):
    client = boto3.client('kms')
    with open(os.path.join(os.environ["LAMBDA_TASK_ROOT"], "secret-baker-secrets.json")) as f:
        secrets = json.load(f)
    context = {"PARAMETER_ARN": secrets[secretName]["arn"]}
    resp = client.decrypt(CiphertextBlob=b64decode(secrets[secretName]["ciphertext"]), EncryptionContext=context)
    return resp['Plaintext'].decode('UTF-8')

SECRETS = [
    "MY_SECRET",
    "MY_OTHER_SECRET",
    "CUSTOM_SECRET",
]

def hello(event, context):
    output_builder = []
    for secret in SECRETS:
        value = kms_decrypt(secret)
        output_builder.append("%s : %s\n" % (secret, value))
    return "".join(output_builder)
