/*jslint es5: true */
var _ = require('lodash');

module.exports = {
  cli : {},

  _init : function (cli) {
    this.cli = cli;
  },

  /**
   * Process a command line
   * starting point for the parser
   * @param argv
   */
  line : function (argv) {
    var story = [];
    if (! this._parse(argv, this.cli.definitions, story)) {
      console.log(story);


    }
  },

  /**
   * recursive function that process in 5 steps
   * 0- Process shortcuts
   * 1- Look for sub commands, if yes -> jump
   * 2- Parse options and remove them and their arguments from the line
   * 3- Parses arguments
   * 4- call the command function with the processes options and arguments
   *
   * @param argv the command line in an array form
   * @param defs the definitions relative to this command set
   * @param story the story of the parsing
   * @param globals some informations propagated thru the tree. used in the recursion
   * @returns 0 if fails, 1 if done
   * @private
   */
  _parse : function (argv, defs, story, globals) {
    globals = globals || { options : {}};
    // ** 0- Look for shortcuts, if yes -> change command line
    if (_.has(defs, 'shortcuts')) {
      _.each(defs.shortcuts, function (shortcutDef, shortcutName) {
        // construct a regexp from name if not present
        var regexp = shortcutDef.regexp || new RegExp('^' + shortcutName + '$','g');
        if (argv[0].match(regexp)) {
          var arg = argv[0];
          argv = shortcutDef.to(argv);
          story.push({'shortcut': arg + ' -> ' + argv});
        }
      });
    }

    // options in super commands are propagated to subcommands (in the global space)
    if (_.has(defs, 'options')) { _.extend(globals.options, defs.options); }

    // ** 1- Look for sub commands, if yes -> jump
    if (_.has(defs, 'commands') && _.has(defs.commands, argv[0])) {
      story.push({'command': argv[0]});
      return this._parse(_.rest(argv, 1), defs.commands[argv[0]], story, globals);
    }

    // **  2- Parse options and remove them and their arguments from the line
    var options = {};
    var nargv = []; // will contain the argv line without options and their arguments
    // process options for now, options can be
    for (var i = 0; i < argv.length; i++) {
      var word = argv[i];
      if (word.substring(0, 2) !== '--') {
        // skip
        nargv.push(word);
      } else {
        var option = word.substring(2);

        if (! _.has(globals.options, option) || globals.options[option] === null) {
          story.push({error : 'Cannot find option --' + option,
            suggestion : 'Available options are : "' + _.keys(globals.options) + '" '
          });
          return 0;
        } else {
          var optDef = globals.options[option];
          var optType = optDef.type || 'string';

          if (_.has(options, option)) {
            story.push({error : 'Option --' + option + ' cannot be used more than once'});
            return 0;
          }

          if (! _.has(this._optionTypes, optType)) {
            // TODO this should be detected ad definition validation
            story.push({error : 'Cannot find option type: ' + optType + ' in the definition list'});
            return 0;
          } else {
            var optArgumentCount = this._optionTypes[optType].argumentCount;

            if (optArgumentCount === 0) { // no argument for this option
              options[option] = 1;
            }  else {
              if ((i + optArgumentCount)  >= argv.length) {
                story.push({error : 'Option --' + option + ' requires ' + optArgumentCount +
                  ' argument(s)'});
                return 0;
              }
              var valid = this._optionTypes[optType].validate(argv[i + 1]);
              if (valid.error) {
                story.push({error : 'Error with option --' + option + ' : ' + valid.error});
                return 0;
              }
              i = i + optArgumentCount;
              options[option] = valid.result;
              story.push({'option': 'validated :' + option});
            }

          }
        }

      }
    }
    argv = nargv; // replace the command line with one cleanup of options


    // **  3- Parses arguments
    var arguments = {};
    if (_.has(defs, 'arguments')) {
      var argumentList = _.keys(defs.arguments);
      for (var j = 0 ; j < argumentList.length ; j++) {
        var argumentName = argumentList[j];
        var argumentDef = defs.arguments[argumentName];
        var argumentValue =  argv[j];


        if (argv.length <= _.keys(arguments).length) {  // not enough arguments in line
          var description =  argumentDef.description ? ' (' + argumentDef.description + ')' : '';
          story.push({error : 'Error, argument not found: "' + argumentName + '"' + description});
          return 0;
        }
        if (_.has(argumentDef, 'regexp')) {
          if (! argumentValue.match(argumentDef.regexp)) {
            var syntax =  argumentDef.syntax ? ': "' + argumentDef.syntax + '"' : '';
            story.push({error : 'Error, argument "' + argumentValue +
              '" does not match syntax "' + argumentName + '" syntax: ' + syntax});
            return 0;
          }
        }
        arguments[argumentName] = argumentValue;
      }
    }

    if (argv.length > _.keys(arguments).length) {  // there are trailing (unused) arguments on the line

      var suggestion = '';
      if (_.has(defs, 'commands')) {
        suggestion += 'Available commands are : "' + _.keys(defs.commands) + '" \n';
      }
      if (_.has(defs, 'shortcuts')) {
        suggestion += 'Available shortcuts are : "' + _.keys(defs.shortcuts) + '" \n';
      }
      if (_.has(defs, 'arguments')) {
        suggestion += 'Available arguments are : "' + _.keys(defs.arguments) + '" \n';
      }

      story.push({error : 'Error, unused arguments on the line: "' +
        _.rest(argv, _.keys(arguments).length) + '"',
      suggestion : suggestion});

      return 0;
    }


    // ** 4 - call the command function with the processes options and arguments
    if (_.has(defs, 'calls')) {
      if (_.has(defs.calls, 'go')) {
        var result = defs.calls.go(
          {app: this.cli.app,
            arguments: arguments,
            options: options});

        if (result.error) {
          console.error('Error, processing command : ' + result.error);
          return 0;
        }

        return 1;
      }
    }


    return 0;
  },


  /**
   * add custom optionTypes for validation
   */
  addOptionsTypes : function (optionTypes) {
    this._optionTypes = _.extend(this._optionTypes, optionTypes);
  },

  /**
   * default optionTypes
   * may be overwriten by parser.addOptionsTypes
   */
  _optionTypes : {

    integer : {
      argumentCount : 1,
      validate : function (argument) {
        var value = argument * 1;
        if (! _.isNumber(value) || (parseFloat(value) !== parseInt(value))) {
          return { error : 'argument "' + argument + '" is not an integer' };
        }
        return { result : value };
      }
    },

    string : {
      argumentCount : 1,
      validate : function (argument) {
        if (! _.isString(argument)) {
          return { error : 'argument "' + argument + '" is not a string' };
        }
        return { result : argument };
      }
    },

    flag : {
      argumentCount : 0,
      validate : function () {
        return true;
      }
    }
  }
};