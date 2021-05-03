<img align="left" src="https://user-images.githubusercontent.com/4380779/63980279-f0b3b300-ca6f-11e9-9953-1afba2a45b18.png" width="200" alt="Secret Baker Logo" />
 Serverless Secret Baker is a Serverless Framework Plugin for secure, performant, and deterministic secret
management using AWS Systems Manager Parameter Store and AWS KMS.
  
[![CircleCI](https://circleci.com/gh/vacasaoss/serverless-secret-baker.svg?style=svg)](https://circleci.com/gh/vacasaoss/serverless-secret-baker) [![Maintainability](https://api.codeclimate.com/v1/badges/40209674df1a65e0112b/maintainability)](https://codeclimate.com/github/vacasaoss/serverless-secret-baker/maintainability) [![Test Coverage](https://api.codeclimate.com/v1/badges/40209674df1a65e0112b/test_coverage)](https://codeclimate.com/github/vacasaoss/serverless-secret-baker/test_coverage) 


---

## How it works

**AWS System Manager Parameter Store** is responsible for storing and managing your versioned secret values. You can create and update your secrets via Parameter Store using your own workflow via the AWS Console or via the AWS CLI.  When uploading secrets, [Parameter Store will use KMS](https://docs.aws.amazon.com/kms/latest/developerguide/services-parameter-store.html) to perform the actual encryption of the secret and store the resulting ciphertext.  It is important to choose a _customer managed_ KMS CMK (customer managed key) rather than a _AWS managed_ KMS CMK in this step in order to have the flexibility to decrypt the secrets at runtime, as we'll see later.  

**Serverless Secert Baker** is responsbile for automatically retrieving the _ciphertext_ stored in Parameter Store and storing it in a well-known file in your bundled application during `serverless deploy`.  Serverless Secret Baker, nor Serverless Framework, never see the decrypted secret values. 

**Runtime Code Snippet for KMS Decryption** is responsible for reading the ciphertext from the well-known file and decrypting it via KMS APIs for use in the application.  Serverless Secret Baker provides sample code snippets in both Python and Node for performing this operation.  Only Lambda functions with an IAM role that enables decryption via the specified KMS CMK will be able to decrypt the secrets.  

## Why all this fuss?  

There are many solutions for secret management with AWS Lambda. Unfortunately, a lot of the solutions unnecessarily expose the secrets in plain text, incur latency by invoking an API call to decrypt a secret with every lambda invocation, or require potentially complex cache invalidation for when a secret is rotated.

Here are some common patterns to secret management and their downsides:

1. **Use Lambda Environment Variables:** The plaintext value of the secret is exposed insecurely within the Cloud Formation template. [AWS explicitly recommends](https://docs.aws.amazon.com/lambda/latest/dg/env_variables.html) not storing sensitive information in Lambda Environment Variables as it is not encrypted in transit during deploy time.
2. **Use the built-in Serverless Framework for AWS Parameter Store:**. By using the built-in syntax of `${ssm:/path/to/secret~true}` this will retrieve the plaintext secret at packaging time and store it in an Environment Variables. This has the same downsides to 1).
3. **Use AWS Parameter Store or AWS Secret Manager at Runtime**: Requires either retrieving the secret via API at every invocation of the Lambda (latency) or retrieving it once and caching the secret in the lambda global scope. If caching the secret in global scope a cache invalidation strategy is needed to refresh the secret when it is updated in Parameter Store / Secret Manager to prevent lambdas using old, potentially invalid secrets.

This plugin addresses these concerns by focusing on:

1. **Security:** Secrets should _always_ be encrypted at rest and in transit. The secrets are stored in Parameter Store using a custom KMS CMK. The only time it is decrypted is at lambda invocation.
2. **Performance:** Minimize external dependencies and API calls. The secrets are retrieved directly from KMS. There is no runtime dependency on Parameter Store or Secrets Manager. In addition, the secret can be cached in the Lambda global scope so only a single API call per warmed up lambda is needed.
3. **Deterministic State:** Complex cache invalidation strategies are not needed. Because the ciphertext is bundled with the lambda at deploy time the secrets can be modified at the source in AWS Parameter Store without effecting the runtime state. In order to apply the new secrets, a new deployment of the Lambdas is required allowing it to go through a CI/CD pipeline to catch any potential errors with secrets and to ensure that _all_ the lambdas get the new secret at the same time.


## Step by step

1. [Create a symmetric customer managed KMS CMK](https://docs.aws.amazon.com/kms/latest/developerguide/create-keys.html#create-symmetric-cmk)
2. [Upload secrets as "SecureString" to SSM Parameter Store via AWS Console](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-create-console.html) or AWS CLI, specifying the Cusomter Managed CMK in created in step 1
3. Install this plugin via `serverless plugin install --name serverless-secret-baker`
4. Add to your `serverless.yml` the following to specify which secrets to retrieve from parameter store:

```
custom:
  secretBaker:
    - MY_SECRET
```

The plugin will create a json file called `secret-baker-secrets.json` with all the secrets and include it in your application during packaging. In the above example the ciphertext and ARN of the AWS Parameter Store parameter located at `MY_SECRET` will be stored in the file under the key `MY_SECRET`.

See example code in [examples](/examples) folder for reference.

6. Ensure your Lambda has permission to decrypt the secret at runtime using the CMK. Example:

```
iamRoleStatements:
  - Effect: Allow
    Action:
      - kms:Decrypt
    Resource:
      - # REPLACE with ARN for your CMK
```

7. Add a code snippet in your application to decrypt the secret:

- [Python Example](/examples/handler.py)
- [Node Example](/examples/handler.js)

## Advanced Configuration

If you would like to name your secrets something different than the path in Parameter Store you can specify a name and path in the configuration like so:

```
custom:
  secretBaker:
    # Retrieves the latest encrypted secret at the given parameter store path
    MY_SECRET: /path/to/ssm/secret
```

You can also pin your secrets to specific versions in Parameter Store to have a deterministic secret value:
```
custom:
  secretBaker:
    # Retrieves the version 2 encrypted secret at the given parameter store path 
    MY_SECRET: /path/to/ssm/secret:2
```


Alternate syntax explcitly defining name and path is also supported:

```
custom:
  secretBaker:
    - name: CUSTOM_SECRET
      path: a/custom/secret/path 
```

This allows you to mix styles

```
custom:
  secretBaker:
    - MY_SECRET
    - MY_OTHER_SECRET
    - name: CUSTOM_SECRET
      path: a/custom/secret/path 
```

### Preserve the encrypted secrets file

The secrets files, `secret-baker-secrets.json`, is automatically generated at the start of
every `serverless deploy`, `serverless package`, `serverless invoke local`, and
`serverless offline` command. The secrets file, by default, will also be automatically removed
upon command completion to not leave it in your source directory. 
If you'd like to preserve the secrets file, pass in the CLI option `--no-secret-baker-cleanup`

<p align="center">
<img src="https://user-images.githubusercontent.com/4380779/63980303-fdd0a200-ca6f-11e9-99e8-8c2012b1c90f.png" width=250 />
</p>
