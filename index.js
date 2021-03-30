"use strict";

const BbPromise = require("bluebird");
const fs = require("fs");
const secretsFile = "secret-baker-secrets.json";

BbPromise.promisifyAll(fs);

class ServerlessSecretBaker {
  constructor(serverless, options) {
    this.hooks = {
      "before:package:createDeploymentArtifacts": this.packageSecrets.bind(
        this
      ),
      "after:package:createDeploymentArtifacts": this.cleanupPackageSecrets.bind(
        this
      ),
      "before:deploy:function:packageFunction": this.packageSecrets.bind(this),
      "after:deploy:function:packageFunction": this.cleanupPackageSecrets.bind(
        this
      ),
      // For serverless-offline plugin
      "before:offline:start:init": this.packageSecrets.bind(this),
      "before:offline:start:end": this.cleanupPackageSecrets.bind(this),
      // For invoke local
      "before:invoke:local:invoke": this.packageSecrets.bind(this),
      "after:invoke:local:invoke": this.cleanupPackageSecrets.bind(this)
    };

    this.options = options;
    this.serverless = serverless;
  }

  getSecretsConfig() {
      const customPath = this.serverless.service.custom;
      const configPath = customPath && customPath.secretBaker;
      const secrets = configPath || [];

      if (Array.isArray(secrets)) {
          return secrets.map((item) => {
              if (typeof item === 'string') {
                  return {
                      name: item,
                      path: item
                  }
              } else {
                  return item
              }
          })
      } else if (typeof secrets === 'object') {
          return Object.entries(secrets).map(([name, path]) => ({
              name,
              path
          }));
      }
      throw new this.serverless.classes.Error(
          "Secret Baker configuration contained an unexpected value."
      );
  }

  async writeSecretToFile() {
    const providerSecrets = this.getSecretsConfig()
    const secrets = {};


    for (const {name, path} of providerSecrets) {
      const param = await this.getParameterFromSsm(path);

      if (!param) {
        throw Error(`Unable to load Secret ${name}`);
      }

      secrets[name] = {
        ciphertext: param.Value,
        arn: param.ARN
      };
    }

    return fs.writeFileAsync(secretsFile, JSON.stringify(secrets));
  }

  getParameterFromSsm(name) {
    return this.serverless
      .getProvider("aws")
      .request(
        "SSM",
        "getParameter",
        {
          Name: name,
          WithDecryption: false
        },
        { useCache: true }
      ) // Use request cache
      .then(response => BbPromise.resolve(response.Parameter))
      .catch(err => {
        if (err.statusCode !== 400) {
          return BbPromise.reject(
            new this.serverless.classes.Error(err.message)
          );
        }

        return BbPromise.resolve(undefined);
      });
  }

  cleanupPackageSecrets() {
    this.serverless.cli.log(`Cleaning up ${secretsFile}`);
    if (fs.existsSync(secretsFile)) fs.unlinkSync(secretsFile);
  }

  packageSecrets() {
    this.serverless.cli.log("Serverless Secrets beginning packaging process");
    this.serverless.service.package.include =
      this.serverless.service.package.include || [];
    return this.writeSecretToFile().then(() =>
      this.serverless.service.package.include.push(secretsFile)
    );
  }
}

module.exports = ServerlessSecretBaker;
