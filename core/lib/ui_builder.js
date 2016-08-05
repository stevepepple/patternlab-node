"use strict";

var path = require('path');
var fs = require('fs-extra');
var ae = require('./annotation_exporter');
var of = require('./object_factory');
var Pattern = of.Pattern;
var pa = require('./pattern_assembler');
var pattern_assembler = new pa();
var eol = require('os').EOL;
var _ = require('lodash');

var ui_builder = function () {

  function addToPatternPaths(patternlab, pattern) {

    console.log('adding',pattern.patternPartial, pattern.patternGroup, pattern.patternBaseName, pattern.name, 'to paths');


    if(!patternlab.patternPaths) {
      patternlab.patternPaths = {};
    }

    if(!patternlab.viewAllPaths) {
      patternlab.viewAllPaths = {};
    }

    if (!patternlab.patternPaths[pattern.patternGroup]) {
      patternlab.patternPaths[pattern.patternGroup] = {};
    }
    patternlab.patternPaths[pattern.patternGroup][pattern.patternBaseName] = pattern.name;
  }

  function writeFile(filePath, data, callback) {
    if (callback) {
      fs.outputFile(filePath, data, callback);
    } else {
      fs.outputFile(filePath, data);
    }
  }

  /*
   * isPatternExcluded
   * returns whether or not the pattern should be excluded from direct rendering or navigation on the front end
   */
  function isPatternExcluded(pattern, patternlab) {
    var styleGuideExcludes = patternlab.config.styleGuideExcludes;
    var isOmitted;

    // skip underscore-prefixed files
    isOmitted = pattern.isPattern && pattern.fileName.charAt(0) === '_';
    if (isOmitted) {
      if (patternlab.config.debug) {
        console.log('Omitting ' + pattern.patternPartial + " from styleguide patterns because it has an underscore suffix.");
      }
      return true;
    }

    //this is meant to be a homepage that is not present anywhere else
    isOmitted = pattern.patternPartial === patternlab.config.defaultPattern;
    if (isOmitted) {
      if (patternlab.config.debug) {
        console.log('Omitting ' + pattern.patternPartial + ' from styleguide patterns because it is defined as a defaultPattern.');
      }
      return true;
    }

    //this pattern is a member of any excluded pattern groups
    isOmitted = styleGuideExcludes && styleGuideExcludes.length && _.some(styleGuideExcludes, function (exclude) {
      return exclude === pattern.patternGroup; });
    if (isOmitted) {
      if (patternlab.config.debug) {
        console.log('Omitting ' + pattern.patternPartial + ' from styleguide patterns its patternGroup is specified in styleguideExcludes.');
      }
      return true;
    }

    //yay, let's include this on the front end
    return isOmitted;
  }

  /*
   * injectDocumentationBlock
   * take the given pattern, fina and construct the view-all pattern block for the group
   */
  function injectDocumentationBlock(pattern, patternlab, isSubtypePattern) {

    var docPattern = patternlab.subtypePatterns['viewall-' + pattern.patternGroup + (isSubtypePattern ? '-' + pattern.patternSubGroup : '')];

    if (docPattern) {
      docPattern.isDocPattern = true;
      return docPattern;
    }

    var docPattern = new Pattern.createEmpty(
      {
        name: pattern.flatPatternPath,
        patternDesc: '',
        patternPartial: 'viewall-' + pattern.patternGroup + (isSubtypePattern ? '-' + pattern.patternSubGroup : ''),
        patternSectionSubtype : isSubtypePattern,
        patternLink: pattern.flatPatternPath + path.sep + 'index.html',
        isPattern: false,
        engine: null,

        //todo this might be broken yet
        flatPatternPath: pattern.flatPatternPath, // + (isSubtypePattern ? '-' + pattern.patternSubGroup : ''),
        isDocPattern: true
      }
    );
    return docPattern;
  }

  /*
   * groupPatterns
   * returns an object representing how the front end styleguide and navigation is structured
   */
  function groupPatterns(patternlab) {
    var groupedPatterns = {
      patternGroups: {}
    };

    _.forEach(sortPatterns(patternlab.patterns), function (pattern) {

      pattern.omitFromStyleguide = isPatternExcluded(pattern, patternlab);

      console.log('sorting', pattern.patternPartial, 'into group', pattern.patternGroup, 'and subtype', pattern.patternSubGroup);

      if (pattern.omitFromStyleguide) { return; }

      if (!groupedPatterns.patternGroups[pattern.patternGroup]) {
        pattern.isSubtypePattern = false;

        groupedPatterns.patternGroups[pattern.patternGroup] = {};

        //todo: test this
        //groupedPatterns.patternGroups[pattern.patternGroup]['viewall-' + pattern.patternGroup] = injectDocumentationBlock(pattern, patternlab, false);
      }
      if (!groupedPatterns.patternGroups[pattern.patternGroup][pattern.patternSubGroup]) {
        pattern.isSubtypePattern = !pattern.isPattern;
        groupedPatterns.patternGroups[pattern.patternGroup][pattern.patternSubGroup] = {};
        groupedPatterns.patternGroups[pattern.patternGroup][pattern.patternSubGroup]['viewall-' + pattern.patternGroup + '-' + pattern.patternSubGroup] = injectDocumentationBlock(pattern, patternlab, true);
      }
      groupedPatterns.patternGroups[pattern.patternGroup][pattern.patternSubGroup][pattern.patternBaseName] = pattern;

      addToPatternPaths(patternlab, pattern);

    });
    return groupedPatterns;
  }

  function buildNavigation(patternlab) {

    if(!patternlab.patternTypeIndex) {
      patternlab.patternTypeIndex = [];
    }

    if(!patternlab.patternTypes){
      patternlab.patternTypes = [];
    }


    for (var i = 0; i < patternlab.patterns.length; i++) {

      var pattern = patternlab.patterns[i];
      var patternSubTypeName;
      var patternSubTypeItemName;
      var flatPatternItem;
      var patternSubType;
      var patternSubTypeItem;
      var viewAllPatternSubTypeItem;

      //get the patternSubType.
      //if there is one or more slashes in the subdir, get everything after
      //the last slash. if no slash, get the whole subdir string and strip
      //any numeric + hyphen prefix
      patternSubTypeName = pattern.subdir.split(path.sep).pop().replace(/^\d*\-/, '');

      //get the patternSubTypeItem
      patternSubTypeItemName = pattern.patternName.replace(/-/g, ' ');

      //assume the patternSubTypeItem does not exist.
      patternSubTypeItem = new of.oPatternSubTypeItem(patternSubTypeItemName);
      patternSubTypeItem.patternPath = pattern.patternLink;
      patternSubTypeItem.patternPartial = pattern.patternPartial;

      //check if the patternType already exists
      var patternTypeIndex = patternlab.patternTypeIndex.indexOf(pattern.patternGroup);
      if (patternTypeIndex === -1) {
        //add the patternType
        var patternType = new of.oPatternType(pattern.patternGroup);

        //add patternPath and viewAllPath
        patternlab.patternPaths[pattern.patternGroup] = patternlab.patternPaths[pattern.patternGroup] || {};
        patternlab.viewAllPaths[pattern.patternGroup] = {};

        //test whether the pattern structure is flat or not - usually due to a template or page
        flatPatternItem = patternSubTypeName === pattern.patternGroup;

        //assume the patternSubType does not exist.
        patternSubType = new of.oPatternSubType(patternSubTypeName);

        //add the patternState if it exists
        if (pattern.patternState) {
          patternSubTypeItem.patternState = pattern.patternState;
        }

        //if it is flat - we should not add the pattern to patternPaths
        if (flatPatternItem) {

          patternType.patternItems.push(patternSubTypeItem);


        } else {

          patternType.patternTypeItems.push(patternSubType);
          patternType.patternTypeItemsIndex.push(patternSubTypeName);
          patternSubType.patternSubtypeItems.push(patternSubTypeItem);
          patternSubType.patternSubtypeItemsIndex.push(patternSubTypeItemName);


          //add the view all PatternSubTypeItem
          viewAllPatternSubTypeItem = new of.oPatternSubTypeItem("View All");
          viewAllPatternSubTypeItem.patternPath = pattern.subdir.slice(0, pattern.subdir.indexOf(pattern.patternGroup) + pattern.patternGroup.length) + "/index.html";
          viewAllPatternSubTypeItem.patternPartial = "viewall-" + pattern.patternGroup;

          patternType.patternItems.push(viewAllPatternSubTypeItem);
          patternlab.viewAllPaths[pattern.patternGroup].viewall = pattern.subdir.slice(0, pattern.subdir.indexOf(pattern.patternGroup) + pattern.patternGroup.length);

        }

        //add the patternType.
        patternlab.patternTypes.push(patternType);
        patternlab.patternTypeIndex.push(pattern.patternGroup);

        //done

      } else {
        //find the patternType
        patternType = patternlab.patternTypes[patternTypeIndex];

        //add the patternState if it exists
        if (pattern.patternState) {
          patternSubTypeItem.patternState = pattern.patternState;
        }

        //test whether the pattern structure is flat or not - usually due to a template or page
        flatPatternItem = patternSubTypeName === pattern.patternGroup;

        //if it is flat - we should not add the pattern to patternPaths
        if (flatPatternItem) {
          //add the patternSubType to patternItems
          patternType.patternItems.push(patternSubTypeItem);


        } else {

          // only do this if pattern is included
          //check to see if patternSubType exists
          var patternTypeItemsIndex = patternType.patternTypeItemsIndex.indexOf(patternSubTypeName);
          if (patternTypeItemsIndex === -1) {
            patternSubType = new of.oPatternSubType(patternSubTypeName);

            //add the patternSubType and patternSubTypeItem
            patternSubType.patternSubtypeItems.push(patternSubTypeItem);
            patternSubType.patternSubtypeItemsIndex.push(patternSubTypeItemName);
            patternType.patternTypeItems.push(patternSubType);
            patternType.patternTypeItemsIndex.push(patternSubTypeName);

          } else {
            //add the patternSubTypeItem
            patternSubType = patternType.patternTypeItems[patternTypeItemsIndex];
            patternSubType.patternSubtypeItems.push(patternSubTypeItem);
            patternSubType.patternSubtypeItemsIndex.push(patternSubTypeItemName);
          }

          //check if we are moving to a new subgroup in the next loop
          if (!patternlab.patterns[i + 1] || pattern.patternSubGroup !== patternlab.patterns[i + 1].patternSubGroup) {

            //add the viewall SubTypeItem
            var viewAllPatternSubTypeItem = new of.oPatternSubTypeItem("View All");
            viewAllPatternSubTypeItem.patternPath = pattern.flatPatternPath + "/index.html";
            viewAllPatternSubTypeItem.patternPartial = "viewall-" + pattern.patternGroup + "-" + pattern.patternSubGroup;

            patternSubType.patternSubtypeItems.push(viewAllPatternSubTypeItem);
            patternSubType.patternSubtypeItemsIndex.push("View All");
          }

        }
      }

      patternlab.viewAllPaths[pattern.patternGroup][pattern.patternSubGroup] = pattern.flatPatternPath;
    }
    return patternTypeIndex;
  }

  function buildFooterHTML(patternlab, patternPartial) {
    //set the pattern-specific footer by compiling the general-footer with data, and then adding it to the meta footer
    var footerPartial = pattern_assembler.renderPattern(patternlab.footer, {
      patternData: JSON.stringify({
        patternPartial: patternPartial,
      }),
      cacheBuster: patternlab.cacheBuster
    });
    var footerHTML = pattern_assembler.renderPattern(patternlab.userFoot, {
      patternLabFoot : footerPartial
    });
    return footerHTML;
  }

  function buildViewAllHTML(patternlab, patterns, patternPartial, isPatternType) {

    console.log('building viewall HTML for ', patternPartial);

    if (isPatternType) {
      patternPartial = patternPartial.substring(patternPartial.indexOf('viewall-'));
    }

    var viewAllHTML = pattern_assembler.renderPattern(patternlab.viewAll,
      {
        partials: patterns,
        patternPartial: patternPartial,
        cacheBuster: patternlab.cacheBuster
      }, {
        patternSection: patternlab.patternSection,
        patternSectionSubtype: patternlab.patternSectionSubType
      });
    return viewAllHTML;
  }

  function buildViewAllPages(mainPageHeadHtml, patternlab, styleguidePatterns) {
    var paths = patternlab.config.paths;
    var patterns = [];

    //loop through the grouped styleguide patterns, building at each level
    _.forEach(styleguidePatterns.patternGroups, function (patternTypeObj, patternType) {

      console.log(1, patternType);

      var p;
      var typePatterns = [];

      _.forOwn(patternTypeObj, function (patternSubtypes, patternSubtype) {

        console.log(2, patternSubtype);

        var patternPartial = patternType + '-' + patternSubtype;
        console.log(3, patternPartial);

        //render the footer needed for the viewall template
        var footerHTML = buildFooterHTML(patternlab, patternPartial);

        //render the viewall template
        var subtypePatterns = _.values(patternSubtypes);

        //determine if we should write at this time by checking if these are flat patterns or grouped patterns
        p = _.find(subtypePatterns, function (pat) {
          console.log(pat.patternPartial, pat.isFlatPattern, pat.patternGroup, pat.patternSubGroup);
          return pat.isDocPattern;
        });

        typePatterns = typePatterns.concat(subtypePatterns);
        var viewAllHTML = buildViewAllHTML(patternlab, subtypePatterns, patternPartial);

        console.log(4, 'about to write view all file to patterns/', p.flatPatternPath, p.patternGroup, p.patternSubGroup);
        writeFile(paths.public.patterns + p.flatPatternPath + '/subtypePatterns.json', JSON.stringify(subtypePatterns));

        console.log(5, '------');
        if(p.patternGroup && p.patternSubGroup){
          writeFile(paths.public.patterns + p.flatPatternPath + '/index.html', mainPageHeadHtml + viewAllHTML + footerHTML);
        }
      });


      console.log('~~~~~~');

      //render the footer needed for the viewall template
      var footerHTML = buildFooterHTML(patternlab, patternType);

      //render the viewall template
      var viewAllHTML = buildViewAllHTML(patternlab, typePatterns, patternType, true);

      writeFile(paths.public.patterns + p.subdir + '/index.json', JSON.stringify(typePatterns));
      console.log(5, 'trying to write view all file to patterns/', p.subdir);

      writeFile(paths.public.patterns + p.subdir + '/index.html', mainPageHeadHtml + viewAllHTML + footerHTML);

      patterns = patterns.concat(typePatterns);

    });

    writeFile(paths.public.patterns + '/patterns.json', JSON.stringify(patterns));

    return patterns;
  }

  function sortPatterns(patternsArray) {
    return patternsArray.sort(function (a, b) {

      if (a.name > b.name) {
        return 1;
      }
      if (a.name < b.name) {
        return -1;
      }

      // a must be equal to b
      return 0;
    });
  }

  function exportData(patternlab) {
    var annotation_exporter = new ae(patternlab);
    var paths = patternlab.config.paths;

    //write out the data
    var output = '';

    //config
    output += 'var config = ' + JSON.stringify(patternlab.config) + ';\n';

    //ishControls
    output += 'var ishControls = {"ishControlsHide":' + JSON.stringify(patternlab.config.ishControlsHide) + '};' + eol;

    //navItems
    output += 'var navItems = {"patternTypes": ' + JSON.stringify(patternlab.patternTypes) + '};' + eol;

    //patternPaths
    output += 'var patternPaths = ' + JSON.stringify(patternlab.patternPaths) + ';' + eol;

    //viewAllPaths
    output += 'var viewAllPaths = ' + JSON.stringify(patternlab.viewAllPaths) + ';' + eol;

    //plugins someday
    output += 'var plugins = [];' + eol;

    //smaller config elements
    output += 'var defaultShowPatternInfo = ' + (patternlab.config.defaultShowPatternInfo ? patternlab.config.defaultShowPatternInfo : 'false') + ';' + eol;
    output += 'var defaultPattern = "' + (patternlab.config.defaultPattern ? patternlab.config.defaultPattern : 'all') + '";' + eol;

    //write all output to patternlab-data
    writeFile(path.resolve(paths.public.data, 'patternlab-data.js'), output);

    //annotations
    var annotationsJSON = annotation_exporter.gather();
    var annotations = 'var comments = { "comments" : ' + JSON.stringify(annotationsJSON) + '};';
    writeFile(path.resolve(paths.public.annotations, 'annotations.js'), annotations);
  }

  function buildFrontend(patternlab) {

    var paths = patternlab.config.paths;

    //determine which patterns should be included in the front-end rendering
    var styleguidePatterns = groupPatterns(patternlab);

    //set the pattern-specific header by compiling the general-header with data, and then adding it to the meta header
    var headerPartial = pattern_assembler.renderPattern(patternlab.header, {
      cacheBuster: patternlab.cacheBuster
    });
    var headerHTML = pattern_assembler.renderPattern(patternlab.userHead, {
      patternLabHead : headerPartial,
      cacheBuster: patternlab.cacheBuster
    });

    //set the pattern-specific footer by compiling the general-footer with data, and then adding it to the meta footer
    var footerPartial = pattern_assembler.renderPattern(patternlab.footer, {
      patternData: '{}',
      cacheBuster: patternlab.cacheBuster
    });
    var footerHTML = pattern_assembler.renderPattern(patternlab.userFoot, {
      patternLabFoot : footerPartial
    });

    //build the viewall pages
    //todo so close
    var patterns = buildViewAllPages(headerHTML, patternlab, styleguidePatterns);

    //build the main styleguide page
    //todo broken
    var styleguideHtml = pattern_assembler.renderPattern(patternlab.viewAll,
      {
        partials: patterns,
        cacheBuster: patternlab.cacheBuster
      }, {
        patternSection: patternlab.patternSection,
        patternSectionSubType: patternlab.patternSectionSubType
      });

    writeFile(path.resolve(paths.public.styleguide, 'html/styleguide.html'), headerHTML + styleguideHtml + footerHTML);

    //build the patternlab navigation
    buildNavigation(patternlab);

    //move the index file from its asset location into public root
    var patternlabSiteHtml;
    try {
      patternlabSiteHtml = fs.readFileSync(path.resolve(paths.source.styleguide, 'index.html'), 'utf8');
    } catch (error) {
      console.log(error);
      console.log("\nERROR: Could not load one or more styleguidekit assets from", paths.source.styleguide, '\n');
      process.exit(1);
    }
    writeFile(path.resolve(paths.public.root, 'index.html'), patternlabSiteHtml);

    //write out patternlab.data object to be read by the client
    exportData(patternlab);
  }

  return {
    buildFrontend: function (patternlab) {
      buildFrontend(patternlab)
    },
    isPatternExcluded: function (pattern, patternlab) {
      return isPatternExcluded(pattern, patternlab);
    },
    groupPatterns: function (patternlab) {
      return groupPatterns(patternlab);
    }
  };

};

module.exports = ui_builder;
