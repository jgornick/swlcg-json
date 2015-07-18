import fs from 'fs';
import path from 'path';

import _ from 'lodash';
import when from 'when';
import program from 'commander';
import xml2js from 'xml2js';
import glob from 'glob';
import pluralize from 'pluralize';

const INTEGER_PROPERTIES = [
    'cost',
    'force',
    'damageCapacity',
    'resources',
    'edgePriority',
    'block',
    'blockNumber',
    'number'
];

const IGNORE_PRODUCTS = [
    'Markers',
    'Affiliation'
];

const IGNORE_PROPERTIES = [
    'instructions',
    'autoScript',
    'autoAction',
    'flavor'
];

const OMIT_TRAITS = [
    'Unique'
];

const CARD_TEXT_FIX = [
    // Fix keyword followed by keyword text (e.g. Pilot)
    [/(\r\n)+\(/gm, ' ('],
    // Replace all CRLF with LF
    [/\r?\n|\r/gm, '\n'],
    [/\n+/gm, '\n'],

    // Trim any extra spaces
    [/^\s*/gm, ''],
    [/^\s*\n/gm, '\n'],
    [/^\n\s*/gm, '\n'],
    [/^\s*$/gm, '\n'],

    // Each line should start with an upper case letter (when found)
    [/^([a-z])/gm, (v) => v.toUpperCase()],
    [/\n([a-z])/gm, (v) => v.toUpperCase()],

    // Add space between Pilot and it's cost as enhancement
    [/Pilot\s*(\(\d+\))\.?(\s*\(.*\))?\s*\n*/gm, 'Pilot $1.$2\n'],
    // Add space between Edge and it's number of icons
    [/Edge\s*(\(\d+\))\.?(\s*\(.*\))?\s*\n*/gm, 'Edge $1.$2\n'],

    // Ensure keywords end with periods
    [/Elite\.?(\s*\(.*\))?\s*\n?/gm, 'Elite.$1\n'],
    [/Influence\.?(\s*\(.*\))?\s*\n?/gm, 'Influence.$1\n'],
    [/Limited\.?(\s*\(.*\))?\s*\n*/gm, 'Limited.$1\n'],
    [/No enhancements\.?(\s*\(.*\))?\s*\n?/gm, 'No enhancements.$1\n'],
    [/Shielding\.?(\s*\(.*\))?\s*\n?/gm, 'Shielding.$1\n'],
    [/Targeted Strike\.?(\s*\(.*\))?\s*\n?/gm, 'Targeted Strike.$1\n'],

    // Add space between edge and it's number of icons
    [/edge(\(\d+\))/gm, 'edge $1'],

    // Remove any trailing new lines
    [/\n$/gm, ''],

    // Fix spelling errors
    [/\bcommmitted\b/gm, 'committed'],
    [/\brfom\b/gm, 'from'],
    [/\baffilation\b/gm, 'affiliation'],
    [/\bdamge\b/gm, 'damage'],
    [/\bgainst\b/gm, 'against'],
    [/\bnonfate\b/gm, 'non-fate'],
    [/\bpalyed\b/gm, 'played'],
    [/\bedgestack\b/gm, 'edge stack'],

    // Add spaces between textual icons in card text
    [/(\[.*?\])(?=\[)/gm, '$1 '],

    [/\[Blast Damage\]/gmi, '[Blast Damage]'],
    [/\[Unit Damage\]/gmi, '[Unit Damage]'],
    [/\[Tactics\]/gmi, '[Tactics]'],

    [/\[Edge[\s\-]Enabled Blast Damage\]/gmi, '[Edge-Enabled Blast Damage]'],
    [/\[Edge[\s\-]Enabled Unit Damage\]/gmi, '[Edge-Enabled Unit Damage]'],
    [/\[EE[\s\-]UD\]/gm, '[Edge-Enabled Unit Damage]'],
    [/\[EE[\s\-]Tactics\]/gmi, '[Edge-Enabled Tactics]'],

    [/\[Imperial Navy\]/gmi, '[Imperial Navy]'],
    [/\[Jedi\]/gmi, '[Jedi]'],
    [/\[Rebel Alliance\]/gmi, '[Rebel Alliance]'],
    [/\[Scum and Villainy\]/gmi, '[Scum and Villainy]'],
    [/\[Sith\]/gmi, '[Sith]'],
    [/\[Smugglers and Spies\]/gmi, '[Smugglers and Spies]']
];

const CARD_ABILITIES = [
    /^((Forced\s)?(Action))\:\s?(.*)/,
    /^((Forced\s)?(Reaction))\:\s?(.*)/,
    /^((Forced\s)?(Interrupt))\:\s?(.*)/
];

const CARD_KEYWORDS = [
    /(Edge)\s?\(\d+\)\./,
    /(Elite)\./,
    /(Influence)\./,
    /(Limited)\./,
    /(No enhancements)\./i,
    /(Pilot)\s?\(\d+\)\./,
    /(Protect)\s+(.*?)\./,
    /(Shielding)\./,
    /(Targeted Strike)\./
];

const COMBAT_ICON_PROPERTY_MAP = {
    'UD': 'unitDamage',
    'BD': 'blastDamage',
    'T': 'tactics'
};

const CARD_PROPERTY_MAP = {
    block: 'objectiveSetNumber',
    blockNumber: 'objectiveSetSequence',
    title: 'name',
    force: 'forceIcons',
    resources: 'resourceValue',
    edgePriority: 'edgePriorityNumber'
};

program
    .description('Parses Star Wars LCG Octgn set XMLs into JSON.')
    .option('-p, --path <path>', 'The path to the OCTGN sets directory. These can be downloaded from https://github.com/db0/Star-Wars-LCG-OCTGN/tree/master/o8g/Sets')
    .parse(process.argv);

let
    xmlParser = new xml2js.Parser(),
    files = glob.sync(path.resolve(process.cwd(), program.path, '**/set.xml')),
    cards = [];

when.all(_.map(files, (file) => {
    return when.promise((resolve, reject) => {
        let
            xml = fs.readFileSync(file);

        xmlParser.parseString(xml, (error, result) => {
            let
                product = result.set.$,
                productName = product.name,
                productOctgnId = product.id,
                productCards = result.set.cards[0].card;

            if (_.includes(IGNORE_PRODUCTS, productName)) {
                return resolve();
            }

            _.forEach(productCards, (card) => {
                let
                    cardOctgnId = card.$.id,
                    cardName = card.$.name;

                cards.push(_.reduce(
                    card.property,
                    (result, property) => {
                        let
                            propertyName = _.camelCase(property.$.name),
                            propertyValue = property.$.value;

                        if (_.includes(IGNORE_PROPERTIES, propertyName)) {
                            return result;
                        }

                        if (propertyName == 'combatIcons') {
                            let combatIcons = _.reduce(
                                propertyValue.split(','),
                                (result, combatIcon) => {
                                    combatIcon = _.trim(combatIcon).split(':');

                                    result[combatIcon[0]] = +combatIcon[1];
                                    return result;
                                },
                                {}
                            );

                            result.normalCombatIcons = _.transform(
                                _.pick(
                                    combatIcons,
                                    (value, key) => {
                                        return !_.startsWith(key, 'EE');
                                    }
                                ),
                                (result, value, key) => {
                                    result[COMBAT_ICON_PROPERTY_MAP[key]] = value;
                                    return result;
                                }
                            );

                            result.edgeEnabledCombatIcons = _.transform(
                                _.pick(
                                    combatIcons,
                                    (value, key) => {
                                        return _.startsWith(key, 'EE');
                                    }
                                ),
                                (result, value, key) => {
                                    key = key.replace('EE-', '');
                                    result[COMBAT_ICON_PROPERTY_MAP[key]] = value;
                                    return result;
                                }
                            );
                        } else if (propertyName == 'traits') {
                            let
                                traits = _.invoke(_.compact(propertyValue.split(/[\-\.]/)), String.prototype.trim);

                            if (_.includes(traits, 'Unique')) {
                                result.isUnique = true;
                            }

                            _.remove(traits, (trait) => _.includes(OMIT_TRAITS, trait));

                            result.abilities.traits = traits || null;
                        } else if (propertyName == 'text') {
                            _.forEach(CARD_TEXT_FIX, ([search, replace]) => {
                                propertyValue = propertyValue.replace(search, replace, 'gm');
                            });

                            let
                                textLines = _.compact(propertyValue.split('\n'));

                            _.forEach(textLines, (line) => {
                                _.forEach(CARD_KEYWORDS, (keyword) => {
                                    let
                                        match = line.match(keyword);

                                    if (match) {
                                        if (result.abilities.keywords == null) {
                                            result.abilities.keywords = [];
                                        }

                                        result.abilities.keywords.push(match[1]);
                                    }
                                });

                                _.forEach(CARD_ABILITIES, (ability) => {
                                    let
                                        match = line.match(ability),
                                        key;

                                    if (match) {
                                        key = pluralize(_.camelCase(match[1]));

                                        if (result.abilities[key] == null) {
                                            result.abilities[key] = [];
                                        }

                                        result.abilities[key].push(match[4]);
                                    }
                                });
                            });

                            result.text = propertyValue;
                        } else {
                            if (_.includes(INTEGER_PROPERTIES, propertyName)) {
                                propertyValue = _.isNaN(parseInt(propertyValue))
                                    ? null
                                    : parseInt(propertyValue)
                            }

                            result[_.result(CARD_PROPERTY_MAP, propertyName, propertyName)] = propertyValue;
                        }

                        return result;
                    },
                    {
                        product: productName,
                        productOctgnId: productOctgnId,
                        number: null,
                        octgnId: cardOctgnId,
                        objectiveSetNumber: null,
                        objectiveSetSequence: null,
                        side: null,
                        affiliation: null,
                        type: null,
                        title: cardName,
                        isUnique: false,
                        cost: 0,
                        damageCapacity: 0,
                        forceIcons: 0,
                        resourceValue: 0,
                        edgePriorityNumber: null,
                        normalCombatIcons: {
                            unitDamage: 0,
                            blastDamage: 0,
                            tactics: 0
                        },
                        edgeEnabledCombatIcons: {
                            unitDamage: 0,
                            blastDamage: 0,
                            tactics: 0
                        },
                        text: null,
                        abilities: {
                            traits: [],
                            keywords: [],
                            actions: [],
                            forcedActions: [],
                            reactions: [],
                            forcedReactions: [],
                            interrupts: [],
                            forcedInterrupts: []
                        }
                    }
                ));
            });

            resolve();
        });
    });
}))
    .then(() => {
        _.forEach(
            _.groupBy(cards, 'product'),
            (cards, product) => {
                cards = _.sortByOrder(cards, ['objectiveSetNumber', 'objectiveSetSequence']);
                fs.writeFileSync(
                    path.resolve(__dirname, '../json', `${_.kebabCase(product)}.json`),
                    JSON.stringify(cards, null, 4)
                );
            }
        );
    });