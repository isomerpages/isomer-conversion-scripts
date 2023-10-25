const ERROR_LOG_PATH = './errors.txt';
const fs = require('fs');

const logError = (errMessage) => {
  console.error(errMessage);
  // append this to a file
  fs.appendFileSync(
    ERROR_LOG_PATH,
    `${errMessage}\n`,
  );
};

module.exports = {
  logError,
};
