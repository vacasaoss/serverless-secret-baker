
const version = require(`${process.cwd()}/package.json`).version;

const TAG = process.env.CIRCLE_TAG || '';

if (version !== TAG) {
  console.error(`version "${version}" does not match tag "${TAG}"`);
  process.exit(1);
}

process.exit(0);
