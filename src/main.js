/*jslint es5: true */

/**
 * An object that contains at least a definitions list.
 * @param app  the calling application
 * @constructor
 */
var CliCLI = function (app) {
  this.app = app;
  this.definitions = app.definitions;
  this.parser._init(this);
};

CliCLI.prototype.parser = require('./parser.js');


module.exports = function (definitions) {
  return new CliCLI(definitions);
};