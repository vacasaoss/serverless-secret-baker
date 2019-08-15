"use strict";

const aws = require("aws-sdk");
const fs = require("fs");
const path = require("path");

async function decryptSecret(secretName) {
  let kms = new aws.KMS();

  const secretsFilePath = path.join(
    process.env.LAMBDA_TASK_ROOT,
    "secret-baker-secrets.json"
  );
  const file = fs.readFileSync(secretsFilePath);
  const secrets = JSON.parse(file);
  const params = {
    CiphertextBlob: Buffer.from(secrets[secretName]["ciphertext"], "base64"),
    EncryptionContext: { PARAMETER_ARN: secrets[secretName]["arn"] }
  };
  const response = await kms.decrypt(params).promise();
  return response.Plaintext.toString("ascii");
}

module.exports.hello = async (event, context) => {
  try {
    const secret = await decryptSecret("MYSECRET");

    return `Secret MYSECRET: ${secret}`;
  } catch (error) {
    return `ERROR!: ${error}`;
  }
};
