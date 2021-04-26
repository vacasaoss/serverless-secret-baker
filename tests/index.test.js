const ServerlessSecretBaker = require("../index.js");
const chai = require("chai");
const { expect } = require("chai");
const sinon = require("sinon");
const sinonChai = require("sinon-chai");
const chaiAsPromised = require("chai-as-promised");
const fs = require("fs");

const SECRETS_FILE = "secret-baker-secrets.json";

const makeServerless = () => ({
  cli: {
    log: () => {},
  },
  service: {
    package: {},
    provider: {},
    custom: {
      secretBaker: {},
    },
  },
  getProvider: () => {},
});

describe("ServerlessSecretBaker", () => {
  before(() => {
    chai.use(chaiAsPromised);
    chai.use(sinonChai);
  });

  beforeEach(() => {
    sinon.stub(fs, "writeFileAsync");
    sinon.stub(fs, "existsSync");
    sinon.stub(fs, "unlinkSync");
  });

  afterEach(() => {
    fs.writeFileAsync.restore();
    fs.existsSync.restore();
    fs.unlinkSync.restore();
  });

  it("should write secrets to the correct file on package", async () => {
    const serverless = makeServerless();
    const bakedGoods = new ServerlessSecretBaker(serverless);
    await bakedGoods.packageSecrets();
    expect(fs.writeFileAsync).to.have.been.calledWith(
      SECRETS_FILE,
      sinon.match.any
    );
  });

  it("should clean up the correct secrets file if it exists", () => {
    const serverless = makeServerless();
    const bakedGoods = new ServerlessSecretBaker(serverless);
    fs.existsSync.returns(false);
    fs.existsSync.withArgs(SECRETS_FILE).returns(true);
    bakedGoods.cleanupPackageSecrets();
    expect(fs.unlinkSync).to.have.been.calledWith(SECRETS_FILE);
  });

  it("should not clean up the correct secrets file with CLI option to not cleanup", () => {
    const serverless = makeServerless();
    const bakedGoods = new ServerlessSecretBaker(serverless, {
      "secret-baker-cleanup": false,
    });
    fs.existsSync.returns(false);
    fs.existsSync.withArgs(SECRETS_FILE).returns(true);
    bakedGoods.cleanupPackageSecrets();
    expect(fs.unlinkSync).to.not.have.been.called;
  });

  it("should not clean up the secrets file if it does not exist", () => {
    const serverless = makeServerless();
    const bakedGoods = new ServerlessSecretBaker(serverless);
    fs.existsSync.returns(false);
    bakedGoods.cleanupPackageSecrets();
    expect(fs.unlinkSync).not.to.have.been.calledWith(SECRETS_FILE);
  });

  describe("Without Secrets", () => {
    let serverless;
    let bakedGoods;

    beforeEach(() => {
      serverless = makeServerless();
      delete serverless.service.custom.secretBaker;
      bakedGoods = new ServerlessSecretBaker(serverless);
    });

    it('should write an empty json object to the output file.', async () => {
      await bakedGoods.writeSecretToFile();
      const secretsJson = fs.writeFileAsync.firstCall.args[1];
      const secrets = JSON.parse(secretsJson);

      expect(secrets).to.be.empty;
    });
  });

  describe("With secrets in unexpected format", () => {
    let serverless;
    let bakedGoods;

    beforeEach(() => {
      serverless = makeServerless();
      serverless.service.custom.secretBaker = 5;
      bakedGoods = new ServerlessSecretBaker(serverless);
    });

    it('should write an empty json object to the output file.', async () => {
      expect(bakedGoods.writeSecretToFile()).to.be.rejected;
    });
  })

  describe("With Secrets Object", () => {
    const expectedSecretName = "MY_SECRET";
    const expectedParameterStoreKey = "PARAMETER STORE KEY";
    const expectedCiphertext = "SECRET VALUE CIPHERTEXT";
    const expectedArn = "SECRET VALUE CIPHERTEXT";

    let serverless;
    let bakedGoods;

    beforeEach(() => {
      serverless = makeServerless();
      serverless.service.custom.secretBaker[
        expectedSecretName
      ] = expectedParameterStoreKey;
      bakedGoods = new ServerlessSecretBaker(serverless);
      sinon.stub(bakedGoods, "getParameterFromSsm");
      bakedGoods.getParameterFromSsm.resolves({
        Value: expectedCiphertext,
        ARN: expectedArn
      });
    });

    it("should write ciphertext for secret to secrets file on package", async () => {
      await bakedGoods.writeSecretToFile();
      const secretsJson = fs.writeFileAsync.firstCall.args[1];
      const secrets = JSON.parse(secretsJson);

      expect(secrets[expectedSecretName].ciphertext).to.equal(
        expectedCiphertext
      );
    });

    it("should write ARN from secret to secrets file on package", async () => {
      await bakedGoods.writeSecretToFile();
      const secretsJson = fs.writeFileAsync.firstCall.args[1];
      const secrets = JSON.parse(secretsJson);

      expect(secrets[expectedSecretName].arn).to.equal(expectedArn);
    });

    it("should throw an error if the parameter cannot be retrieved", async () => {
      bakedGoods.getParameterFromSsm.reset();
      bakedGoods.getParameterFromSsm.resolves(undefined);
      expect(bakedGoods.writeSecretToFile()).to.be.rejected;
    });

    it("should call getParameterFromSsm with the correct parameter key", async () => {
      await bakedGoods.writeSecretToFile();
      expect(bakedGoods.getParameterFromSsm).to.have.been.calledWith(
        expectedParameterStoreKey
      );
    });
  });

  describe("With Secrets String Array", () => {
    const expectedSecretName = "MY_SECRET";
    const expectedCiphertext = "SECRET VALUE CIPHERTEXT";
    const expectedArn = "SECRET VALUE CIPHERTEXT";

    let serverless;
    let bakedGoods;

    beforeEach(() => {
      serverless = makeServerless();
      serverless.service.custom.secretBaker = [expectedSecretName];
      bakedGoods = new ServerlessSecretBaker(serverless);
      sinon.stub(bakedGoods, "getParameterFromSsm");
      bakedGoods.getParameterFromSsm.resolves({
        Value: expectedCiphertext,
        ARN: expectedArn
      });
    });

    it("should write ciphertext for secret to secrets file on package", async () => {
      await bakedGoods.writeSecretToFile();
      const secretsJson = fs.writeFileAsync.firstCall.args[1];
      const secrets = JSON.parse(secretsJson);

      expect(secrets[expectedSecretName].ciphertext).to.equal(
        expectedCiphertext
      );
    });

    it("should write ARN from secret to secrets file on package", async () => {
      await bakedGoods.writeSecretToFile();
      const secretsJson = fs.writeFileAsync.firstCall.args[1];
      const secrets = JSON.parse(secretsJson);

      expect(secrets[expectedSecretName].arn).to.equal(expectedArn);
    });

    it("should throw an error if the parameter cannot be retrieved", async () => {
      bakedGoods.getParameterFromSsm.reset();
      bakedGoods.getParameterFromSsm.resolves(undefined);
      expect(bakedGoods.writeSecretToFile()).to.be.rejected;
    });

    it("should call getParameterFromSsm with the correct parameter key", async () => {
      await bakedGoods.writeSecretToFile();
      expect(bakedGoods.getParameterFromSsm).to.have.been.calledWith(
          expectedSecretName
      );
    });
  });

  describe("With Secrets Object Array", () => {
    const expectedSecretName = "MY_SECRET";
    const expectedParameterStoreKey = "MY_PARAMETER_STORE_KEY"
    const expectedCiphertext = "SECRET VALUE CIPHERTEXT";
    const expectedArn = "SECRET VALUE CIPHERTEXT";

    let serverless;
    let bakedGoods;

    beforeEach(() => {
      serverless = makeServerless();
      serverless.service.custom.secretBaker = [
        {
          name: expectedSecretName,
          path: expectedParameterStoreKey,
        },
      ];
      bakedGoods = new ServerlessSecretBaker(serverless);
      sinon.stub(bakedGoods, "getParameterFromSsm");
      bakedGoods.getParameterFromSsm.resolves({
        Value: expectedCiphertext,
        ARN: expectedArn
      });
    });

    it("should write ciphertext for secret to secrets file on package", async () => {
      await bakedGoods.writeSecretToFile();
      const secretsJson = fs.writeFileAsync.firstCall.args[1];
      const secrets = JSON.parse(secretsJson);

      expect(secrets[expectedSecretName].ciphertext).to.equal(
        expectedCiphertext
      );
    });

    it("should write ARN from secret to secrets file on package", async () => {
      await bakedGoods.writeSecretToFile();
      const secretsJson = fs.writeFileAsync.firstCall.args[1];
      const secrets = JSON.parse(secretsJson);

      expect(secrets[expectedSecretName].arn).to.equal(expectedArn);
    });

    it("should throw an error if the parameter cannot be retrieved", async () => {
      bakedGoods.getParameterFromSsm.reset();
      bakedGoods.getParameterFromSsm.resolves(undefined);
      expect(bakedGoods.writeSecretToFile()).to.be.rejected;
    });

    it("should call getParameterFromSsm with the correct parameter key", async () => {
      await bakedGoods.writeSecretToFile();
      expect(bakedGoods.getParameterFromSsm).to.have.been.calledWith(
          expectedParameterStoreKey
      );
    });
  });

  describe("getParameterFromSsm", () => {
    let bakedGoods;
    let getProviderStub;
    let requestStub;

    beforeEach(() => {
      const serverless = makeServerless();
      requestStub = sinon.stub().resolves({});
      getProviderStub = sinon
        .stub(serverless, "getProvider")
        .returns({ request: requestStub });
      bakedGoods = new ServerlessSecretBaker(serverless);
    });

    it("should request SSM getParameter with name", async () => {
      await bakedGoods.getParameterFromSsm("someName");
      expect(requestStub).to.be.calledWith(
        sinon.match.any,
        sinon.match.any,
        sinon.match.has("Name", "someName"),
        sinon.match.any
      );
    });

    it("should request SSM getParameter with Decrypt false", async () => {
      await bakedGoods.getParameterFromSsm("someName");
      expect(requestStub).to.be.calledWith(
        sinon.match.any,
        sinon.match.any,
        sinon.match.has("WithDecryption", false),
        sinon.match.any
      );
    });

    it("Should resolve to response parameter", async () => {
      requestStub.reset();
      const expectedValue = "asdfasdfasdf";
      requestStub.resolves({ Parameter: expectedValue });

      const result = await bakedGoods.getParameterFromSsm("someName");

      expect(result).to.equal(expectedValue);
    });

    it("Should Reject to error message if status is not 400", async () => {
      requestStub.reset();
      const expectedMessage = "Oh NO!!";
      requestStub.rejects({ statusCode: 500, message: expectedMessage });

      await expect(bakedGoods.getParameterFromSsm("someName")).to.be.rejected;
    });

    it("Should resolve to undefined if status is 400", async () => {
      requestStub.reset();
      const expectedMessage = "Oh NO!!";
      requestStub.rejects({ statusCode: 400, message: expectedMessage });

      expect(await bakedGoods.getParameterFromSsm("someName")).to.be.undefined;
    });

    // Should Resolve to undefined for other errors
  });
});
