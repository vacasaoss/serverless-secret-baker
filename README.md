# serverless-secret-baker

<img src="https://user-images.githubusercontent.com/4380779/63980279-f0b3b300-ca6f-11e9-9953-1afba2a45b18.png" width="150" />

[![CircleCI](https://circleci.com/gh/vacasaoss/serverless-secret-baker.svg?style=svg)](https://circleci.com/gh/vacasaoss/serverless-secret-baker) [![Maintainability](https://api.codeclimate.com/v1/badges/40209674df1a65e0112b/maintainability)](https://codeclimate.com/github/vacasaoss/serverless-secret-baker/maintainability) [![Test Coverage](https://api.codeclimate.com/v1/badges/40209674df1a65e0112b/test_coverage)](https://codeclimate.com/github/vacasaoss/serverless-secret-baker/test_coverage) 

A Serverless Framework Plugin for secure, performant, and deterministic secret
management.

## How it works

<img src="https://user-images.githubusercontent.com/4380779/63980305-fdd0a200-ca6f-11e9-8465-a334b7f0e8f0.png" width="200" />

Secrets are first stored in AWS Parameter Store (aka SSM) for ease of management. At deploytime time this plugin will retrieve the _encrypted_ value of the secrets, store them in a file with associated metadata, and add that file to the serverless deployment package.

<img src="https://user-images.githubusercontent.com/4380779/63980300-fd380b80-ca6f-11e9-9297-96dbe0334c05.png" width="200" />


When the Lambda is invoked an AWS SDK call is used to decrypt the stored ciphertext via KMS directly.


<img src="https://user-images.githubusercontent.com/4380779/63980301-fdd0a200-ca6f-11e9-8bd2-1dc0c12ed771.png" width="200" />

## Prerequisites

1. Create a custom KMS CMK.
2. Upload secrets to SSM Parameter Store using the CMK
3. Install this plugin with `npm install --save-dev serverless-secret-baker`
4. Add to your `serverless.yml` the following to install the plugin:

```
plugins:
  - serverless-secret-baker
```

5. Add to your `serverless.yml` the following to specify which secrets to retrieve from parameter store:

```
provider:
  environmentSecrets:
    MYSECRET: /path/to/ssm/secret
```

Alternatively, if you would like to reference the secrets by their name in the
parameter store you can specify the secrets as a list of strings.

```
provider:
  environmentSecrets:
    - MYSECRET
```

Which is equivalent to:

```
provider:
  environmentSecrets:
    MY_SECRET: MY_SECRET
```

The plugin will create a json file with all the secrets. In the above example the ciphertext and ARN of the secret located at `path/to/ssm/secret` will be stored in the file under the key `MYSECRET`.
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

## Why use this plugin?

There are many solutions for secret management with AWS Lambda. Unfortunately, a lot of the solutions unnecessarily expose the secrets in plain text, incur latency by invoking an API call to decrypt a secret with _every_ lambda invocation, or require potentially complex cache invalidation for when a secret is rotated.

Here are some common patterns to secret management and their downsides:

1. **Use Lambda Environment Variables:** The plaintext value of the secret is exposed insecurely within the Cloud Formation template. [AWS explicitly recommends](https://docs.aws.amazon.com/lambda/latest/dg/env_variables.html) not storing sensitive information in Lambda Environment Variables as it is not encrypted in transit during deploy time.
2. **Use the built-in Serverless Framework for AWS Parameter Store:**. By using the built-in syntax of `${ssm:/path/to/secret~true}` this will retrieve the plaintext secret at packaging time and store it in an Environment Variables. This has the same downsides to 1).
3. **Use AWS Parameter Store or AWS Secret Manager at Runtime**: Requires either retrieving the secret via API at every invocation of the Lambda (latency) or retrieving it once and caching the secret in the lambda global scope. If caching the secret in global scope a cache invalidation strategy is needed to refresh the secret when it is updated in Parameter Store / Secret Manager to prevent lambdas using old, potentially invalid secrets.

This plugin addresses these concerns by focusing on:

1. **Security:** Secrets should _always_ be encrypted at rest and in transit. The secrets are stored in Parameter Store using a custom KMS CMK. The only time it is decrypted is at lambda invocation.
2. **Performance:** Minimize external dependencies and API calls. The secrets are retrieved directly from KMS. There is no runtime dependency on Parameter Store or Secrets Manager. In addition, the secret can be cached in the Lambda global scope so only a single API call per warmed up lambda is needed.
3. **Deterministic State:** Complex cache invalidation strategies are not needed. Because the ciphertext is bundled with the lambda at deploy time the secrets can be modified at the source in AWS Parameter Store without effecting the runtime state. In order to apply the new secrets, a new deployment of the Lambdas is required allowing it to go through a CI/CD pipeline to catch any potential errors with secrets and to ensure that _all_ the lambdas get the new secret at the same time.

<img src="https://user-images.githubusercontent.com/4380779/63980303-fdd0a200-ca6f-11e9-99e8-8c2012b1c90f.png" />
