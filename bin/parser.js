import fs from 'fs';
import path from 'path';

import _ from 'lodash';
import when from 'when';
import program from 'commander';
import xml2js from 'xml2js';
import glob from 'glob';
import pluralize from 'pluralize';

const PRODUCT_FIX = [
    [/Desolation of Hoth/, 'The Desolation of Hoth'],
    [/The Search For Skywalker/, 'The Search for Skywalker']
];

const IGNORE_PRODUCTS = [
    'Markers'
];

const PRODUCT_CYCLES_MAP = {
    'Core Set': ['Core Set'],
    'The Hoth Cycle': [
        'The Desolation of Hoth',
        'The Search for Skywalker',
        'A Dark Time',
        'Assault on Echo Base',
        'The Battle of Hoth',
        'Escape from Hoth'
    ],
    'Edge of Darkness': ['Edge of Darkness'],
    'Balance of the Force': ['Balance of the Force'],
    'Echoes of the Force Cycle': [
        'Heroes and Legends',
        'Lure of the Dark Side',
        'Knowledge and Defense',
        'Join Us or Die',
        'It Binds All Things',
        'Darkness and Light'
    ],
    'Rogue Squadron Cycle': [
        'Ready for Takeoff',
        'Draw Their Fire',
        'Evasive Maneuvers',
        'Attack Run',
        'Chain of Command',
        'Jump to Lightspeed'
    ],
    'Between the Shadows': ['Between the Shadows'],
    'Imperial Entanglements': ['Imperial Entanglements'],
    'Endor Cycle': [
        `Solo's Command`,
        'New Alliances',
        'The Forest Moon',
        'So Be It',
        'Press the Attack',
        'Redemption and Return'
    ],
    'Galactic Ambitions': ['Galactic Ambitions']
};

const IGNORE_CARD_PROPERTIES = [
    'instructions',
    'autoScript',
    'autoAction',
    'flavor'
];

const IGNORE_CARD_TYPE_PROPERTIES = {
    'Affiliation': [
        'block',
        'blockNumber',
        'cost',
        'damageCapacity',
        'force',
        'combatIcons',
        'edgePriority'
    ],
    'Objective': [
        'cost',
        'force',
        'combatIcons',
        'edgePriority'
    ],
    'Unit': [
        'edgePriority'
    ],
    'Enhancement': [
        'damageCapacity',
        'combatIcons',
        'edgePriority'
    ],
    'Event': [
        'damageCapacity',
        'resources',
        'combatIcons',
        'edgePriority'
    ],
    'Fate': [
        'cost',
        'damageCapacity',
        'resources',
        'combatIcons'
    ],
    'Mission': [
        'combatIcons',
        'edgePriority'
    ],
};

const CARD_PROPERTY_MAP = {
    id: {
        field: 'octgnId',
        value: (properties) => properties.id
    },
    number: {
        field: 'number',
        value: (properties) => +properties.number
    },
    block: {
        field: 'objectiveSetNumber',
        value: (properties) => +properties.block
    },
    blockNumber: {
        field: 'objectiveSetSequence',
        value: (properties) => +properties.blockNumber
    },
    name: {
        field: 'title',
        value: (properties) => properties.name
    },
    cost: {
        field: 'cost',
        value: (properties) => +properties.cost
    },
    damageCapacity: {
        field: 'damageCapacity',
        value: (properties) => +properties.damageCapacity
    },
    force: {
        field: 'forceIcons',
        value: (properties) => +properties.force
    },
    resources: {
        field: 'resourceValue',
        value: (properties) => String(properties.resources).toUpperCase() == 'X'
            ? 'X'
            : properties.resources == 0
                ? null
                : +properties.resources
    },
    edgePriority: {
        field: 'edgePriorityNumber',
        value: (properties) => +properties.edgePriority
    }
};

const CARD_TRAITS_FIX = [
    [/\bFIghter\b/, 'Fighter'],
    [/\bWookie\b/, 'Wookiee']
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

    // Trim spaces at the beginning of the text
    [/^\s+/gm, ''],
    // Trim spaces at the end of the text
    [/\s+$/gm, ''],
    // Trim spaces before a new line
    [/\s+\n/gm, '\n'],
    // Trim spaces after a new line
    [/\n\s+/gm, '\n'],
    // Trim spaces on an empty line
    [/^\s+$/gm, '\n'],
    // Trim spaces on an empty line between new lines
    [/\n\s+\n/gm, '\n'],

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

    // Add space between : and next character
    [/\:([^\s])/gm, ': $1'],

    // Remove any trailing new lines
    [/\n$/gm, ''],

    // Fix spelling errors
    [/\bcommmitted\b/gm, 'committed'],
    [/\brfom\b/gm, 'from'],
    [/\baffilation\b/gm, 'affiliation'],
    [/\bdamge\b/gm, 'damage'],
    [/\bgainst\b/gm, 'gains'],
    [/\bnonfate\b/gm, 'non-fate'],
    [/\bpalyed\b/gm, 'played'],
    [/\bedgestack\b/gm, 'edge stack'],
    [/Enhance you play area/gm, 'Enhance your play area'],
    [/\bteh\b/gm, 'the'],
    [/\bforce\b/gm, 'Force'],

    // Add spaces between textual icons in card text
    [/(\[.*?\])(?=\[)/gm, '$1 '],

    // Normalize icon text
    [/\[Blast Damage\]/gmi, '[Blast Damage]'],
    [/\[Unit Damage\]/gmi, '[Unit Damage]'],
    [/\[Tactics\]/gmi, '[Tactics]'],

    [/\[(Edge[\s\-]Enabled|EE) Blast Damage\]/gmi, '[Edge-Enabled Blast Damage]'],
    [/\[(Edge[\s\-]Enabled|EE) Unit Damage\]/gmi, '[Edge-Enabled Unit Damage]'],
    [/\[EE[\s\-]UD\]/gm, '[Edge-Enabled Unit Damage]'],
    [/\[EE[\s\-]Tactics\]/gmi, '[Edge-Enabled Tactics]'],

    [/\[Imperial Navy\]/gmi, '[Imperial Navy]'],
    [/\[Jedi\]/gmi, '[Jedi]'],
    [/\[Rebel Alliance\]/gmi, '[Rebel Alliance]'],
    [/\[Scum and Villainy\]/gmi, '[Scum and Villainy]'],
    [/\[Sith\]/gmi, '[Sith]'],
    [/\[Smugglers and Spies\]/gmi, '[Smugglers and Spies]']
];

const CARD_AFFILIATION_LOCK_RE = /(.*?) affiliation only\./gm;
const CARD_OBJECTIVE_DECK_LIMIT_RE = /Limit 1 per objective deck\./gm
const CARD_ABILITIES_RE = /((Forced\s)?(Action|Reaction|Interrupt))/gm

const CARD_KEYWORDS = [
    {
        keyword: 'Edge',
        re: /(Edge)\s*\((\d+)\)\.(?:\s*\((.*?)\))?\s*\n*/,
        forceIcons: (match) => parseInt(match[2]),
        text: (match) => match[3]
    },
    {
        keyword: 'Elite',
        re: /(Elite)\.(?:\s*\((.*?)\))?\s*\n*/,
        text: (match) => match[2]
    },
    {
        keyword: 'Influence',
        re: /(Influence)\.(?:\s*\((.*?)\))?\s*\n*/,
        text: (match) => match[2]
    },
    {
        keyword: 'Limited',
        re: /(Limited)\.(?:\s*\((.*?)\))?\s*\n*/,
        text: (match) => match[2]
    },
    {
        keyword: 'No enhancements',
        re: /(No enhancements)\.(?:\s*\((.*?)\))?\s*\n*/i,
        text: (match) => match[2]
    },
    {
        keyword: 'Pilot',
        re: /(Pilot)\s*\((\d+)\)\.(?:\s*\((.*?)\))?\s*\n*/,
        cost: (match) => parseInt(match[2]),
        text: (match) => match[3]
    },
    {
        keyword: 'Protect',
        re: /(Protect)\s*(.*?)\.(?:\s*\((.*?)\))?\s*\n*/,
        descriptor: (match) => match[2],
        text: (match) => match[3]
    },
    {
        keyword: 'Shielding',
        re: /(Shielding)\.(?:\s*\((.*?)\))?\s*\n*/,
        text: (match) => match[2]
    },
    {
        keyword: 'Targeted Strike',
        re: /(Targeted Strike)\.(?:\s*\((.*?)\))?\s*\n*/,
        text: (match) => match[2]
    }
];

const COMBAT_ICON_PROPERTY_MAP = {
    'UD': 'unitDamage',
    'BD': 'blastDamage',
    'T': 'tactics'
};

const CARD_SCENARIOS_MAP = {
    'Deals Damage': (text) => !!text.match(/\bdeals?\b(?:[^\:\n\.]*?)damage/gm),
    'Reduces Cost': (text) => !!text.match(/\breduces?\b(?:[^\:\n\.]*?)cost/gm),
    'Places Focus Token': (text) => !!text.match(/\bplaces?\b(?:[^\:\n\.]*?)focus token/gm),
    'Removes Focus Token': (text) => !!text.match(/\bremoves?\b(?:[^\:\n\.]*?)focus token/gm),
    'Moves Focus Token': (text) => !!text.match(/\bmoves?\b(?:[^\:\n\.]*?)focus token/gm),
    'Draws Card': (text) => !!text.match(/\bdraws?\b(?!phase)(?:[^\:\n\.]*?)card/gm),
    'Puts Into Play': (text) => !!text.match(/\bputs?\b(?:[^\:\n\.]*?)into play\b/gm),
    'Puts Into Play From Discard Pile': (text) => !!text.match(/\bputs?\b(?:[^\:\n\.]*?)into play (?:.*?) discard pile\\b/gm),
    'Puts Into Play From Hand': (text) => !!text.match(/\bputs?\b(?:[^\:\n\.]*?)into play (?:.*?) hand\\b/gm),
    'Gains Combat Icon': (text) => !!text.match(/\bgains?\b(?:[^\:\n\.]*?)(combat icon)(?:.*?)\./gm),
    'Gains Damage Capacity': (text) => !!text.match(/\bgains?\b(?:[^\:\n\.]*?)(damage capacity)(?:.*?)\./gm),
    'Gains Resource Value': (text) => !!text.match(/\bgains?\b(?:[^\:\n\.]*?)(resource value)(?:.*?)\./gm),
    'Gains Edge': (text) => !!text.match(/\bgains?\b(?:[^\:\n\.]*?)(edge)(?:.*?)\./gm),
    'Gains Shielding': (text) => !!text.match(/\bgains?\b(?:[^\:\n\.]*?)(shielding)(?:.*?)\./gm),
    'Gains Targeted Strike': (text) => !!text.match(/\bgains?\b(?:[^\:\n\.]*?)(targeted strike)(?:.*?)\./gm),
    'Gains Elite': (text) => !!text.match(/\bgains?\b(?:[^\:\n\.]*?)(elite)(?:.*?)\./gm),
    'Gains Force Icon': (text) => !!text.match(/\bgains?\b(?:[^\:\n\.]*?)(Force icon)(?:.*?)\./gm),
    'Loses Force Icon': (text) => !!text.match(/\bloses?\b(?:[^\:\n\.]*?)(Force icon)(?:.*?)\./gm),
    'Contributes Force Icon': (text) => !!text.match(/\bcontributes?\b(?:[^\:\n\.]*?)(Force icon)(?:.*?)\./gm),
    // 'Captures Card': (text) => !!text.match(/(?<!After you\s)\bcapture\b/gm),
    'Removes from Force': (text) => !!text.match(/\b[Rr]emoves?\b(?:.*?) from the Force(?!\sstruggle)\b/gm),
    // 'Commits to Force': (text) => !!text.match(/(?<!After you\s|cannot\s)\b[Cc]ommits?\b(?:.*?)\bto\b(?:.*?)\bthe Force\b/gm),
    // 'Adds Force Icons to Force Struggle': (text) => !!text.match(/(?:(?<=[Dd]ouble the|gain|gains|contribute|contributes|counts)\b(?:[^\:\[\n]*?)\sForce icons?|(?<=its)\b(?:[^\:\[\n]*?)\sForce icons? count towards?)/gm)

};

const STATS_FIELD_MAP = {
    'cost': 'cost',
    'damageCapacity': 'damageCapacity',
    'forceIcons': 'forceIcons',
    'resourceValue': 'resourceValue',
    'edgePriorityNumber': 'edgePriorityNumber',
    'normalUnitDamage': 'normalCombatIcons.unitDamage',
    'normalBlastDamage': 'normalCombatIcons.blastDamage',
    'normalTactics': 'normalCombatIcons.tactics',
    'edgeEnabledUnitDamage': 'edgeEnabledCombatIcons.unitDamage',
    'edgeEnabledBlastDamage': 'edgeEnabledCombatIcons.blastDamage',
    'edgeEnabledTactics': 'edgeEnabledCombatIcons.tactics'
};

const STATS_BY_TYPE_FIELD_MAP = {
    'Objective': {
        'damageCapacity': 'damageCapacity',
        'resourceValue': 'resourceValue'
    },
    'Unit': {
        'cost': 'cost',
        'damageCapacity': 'damageCapacity',
        'forceIcons': 'forceIcons',
        'resourceValue': 'resourceValue',
        'normalUnitDamage': 'normalCombatIcons.unitDamage',
        'normalBlastDamage': 'normalCombatIcons.blastDamage',
        'normalTactics': 'normalCombatIcons.tactics',
        'edgeEnabledUnitDamage': 'edgeEnabledCombatIcons.unitDamage',
        'edgeEnabledBlastDamage': 'edgeEnabledCombatIcons.blastDamage',
        'edgeEnabledTactics': 'edgeEnabledCombatIcons.tactics'
    },
    'Enhancement': {
        'cost': 'cost',
        'forceIcons': 'forceIcons',
        'resourceValue': 'resourceValue'
    },
    'Event': {
        'cost': 'cost',
        'forceIcons': 'forceIcons'
    },
    'Fate': {
        'forceIcons': 'forceIcons',
        'edgePriorityNumber': 'edgePriorityNumber'
    }
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

            _.forEach(PRODUCT_FIX, ([search, replace]) => {
                productName = productName.replace(search, replace, 'gm');
            });

            if (_.includes(IGNORE_PRODUCTS, productName)) {
                return resolve();
            }

            _.forEach(productCards, (card) => {
                let
                    cardOctgnId = card.$.id,
                    cardName = card.$.name,
                    cardProperties = _.reduce(
                        card.property,
                        (result, property) => {
                            result[_.camelCase(property.$.name)] = property.$.value;
                            return result;
                        },
                        {
                            name: card.$.name,
                            id: card.$.id
                        }
                    );

                cards.push(_.reduce(
                    cardProperties,
                    (result, propertyValue, propertyName) => {
                        if (_.includes(IGNORE_CARD_PROPERTIES, propertyName)) {
                            return result;
                        }

                        if (_.includes(IGNORE_CARD_TYPE_PROPERTIES[cardProperties.type], propertyName)) {
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
                            _.forEach(CARD_TRAITS_FIX, ([search, replace]) => {
                                propertyValue = propertyValue.replace(search, replace, 'gm');
                            });

                            let
                                traits = _.invoke(_.compact(propertyValue.split(/[\-\.]/)), String.prototype.trim);

                            if (_.includes(traits, 'Unique')) {
                                result.isUnique = true;
                            }

                            _.remove(traits, (trait) => _.includes(OMIT_TRAITS, trait));

                            result.abilities.traits = traits;
                        } else if (propertyName == 'text') {
                            _.forEach(CARD_TEXT_FIX, ([search, replace]) => {
                                propertyValue = propertyValue.replace(search, replace, 'gm');
                            });

                            let
                                textLines = _.compact(propertyValue.split('\n')),
                                affiliationLockMatch;

                            _.forEach(textLines, (line) => {
                                affiliationLockMatch = line.match(CARD_AFFILIATION_LOCK_RE);

                                if (affiliationLockMatch) {
                                    result.affiliationLock = affiliationLockMatch[1];
                                }

                                if (line.match(CARD_OBJECTIVE_DECK_LIMIT_RE)) {
                                    result.isLimitedToObjectiveDeck = true;
                                }

                                _.forEach(CARD_KEYWORDS, (keyword) => {
                                    let
                                        match = line.match(keyword.re);

                                    keyword = _.omit(keyword, ['re']);

                                    if (match) {
                                        keyword = _.mapValues(
                                            keyword,
                                            (value, key) => {
                                                if (_.isFunction(value)) {
                                                    return value(match);
                                                }
                                                return value;
                                            }
                                        );

                                        result.abilities.keywords.push(keyword);
                                    }
                                });

                                _.forEach(CARD_SCENARIOS_MAP, (test, scenario) => {
                                    if (test(line)) {
                                        result.abilities.scenarios.push(scenario);
                                    }
                                });
                            });

                            if (result.abilities.traits.length) {
                                result.abilities.types.push('Trait');
                            }

                            if (result.abilities.keywords.length) {
                                result.abilities.types.push('Keyword');
                            }

                            _.forEach(propertyValue.match(CARD_ABILITIES_RE), (ability) => {
                                result.abilities.types.push(ability);
                            });

                            result.text = _.trim(propertyValue) == '' ? null : propertyValue;
                        } else if (CARD_PROPERTY_MAP[propertyName] != null) {
                            result[CARD_PROPERTY_MAP[propertyName].field] = CARD_PROPERTY_MAP[propertyName].value(cardProperties);
                            return result;
                        } else {
                            result[propertyName] = _.trim(propertyValue) == '' ? null : propertyValue;
                        }

                        return result;
                    },
                    {
                        product: productName,
                        productCycle: _.findKey(
                            PRODUCT_CYCLES_MAP,
                            (products, cycle) => _.includes(products, productName)
                        ),
                        productOctgnId: productOctgnId,
                        number: null,
                        octgnId: null,
                        objectiveSetNumber: null,
                        objectiveSetSequence: null,
                        side: null,
                        affiliation: null,
                        affiliationLock: null,
                        type: null,
                        title: null,
                        isUnique: false,
                        isLimitedToObjectiveDeck: false,
                        cost: null,
                        damageCapacity: null,
                        forceIcons: null,
                        resourceValue: null,
                        edgePriorityNumber: null,
                        normalCombatIcons: null,
                        edgeEnabledCombatIcons: null,
                        text: null,
                        abilities: {
                            types: [],
                            traits: [],
                            referencedTraits: [],
                            keywords: [],
                            scenarios: []
                        },
                        illustrator: null
                    }
                ));
            });

            resolve();
        });
    });
}))
    .then(() => {
        let
            traits = _.sortBy(_.uniq(_.flatten(_.pluck(cards, 'abilities.traits')))),
            traitsRegExp = _.map(
                traits,
                (trait) => {
                    let
                        lookahead = '';

                    if (trait == 'Force') {
                        // TODO: Negative Lookbehind for:
                        // Balance of the Force
                        // commit.*Force
                        // removed from the
                        // remove a target unit from the
                        //
                        // Reverse the string and use the following PCRE regex.
                        // (?<!resU\s|elggurts\s|tiripS\s|evitisneS\s|esahp\s|noci\s|drac\s)\becroF\b(?!\s(?:eht fo ecnalaB|.*?timmoc|eht morf devomer|eht morf tinu tegrat a evomer))
                        // https://regex101.com/r/bP1fC7/1
                        lookahead = '(?!\\s(?:card|icon|phase|Sensitive|Spirit|struggle|User))';
                    }

                    return {
                        regex: new RegExp(`\\b${trait}\\b${lookahead}`, 'gm'),
                        trait
                    };
                }
            );

        _.forEach(cards, (card) => {
            card.abilities.referencedTraits = _.reduce(
                traitsRegExp,
                (result, search) => {
                    if (card.text && card.text.match(search.regex)) {
                        result.push(search.trait);
                    }
                    return result;
                },
                []
            );
        });

        return when.resolve();
    })
    .then(() => {
        let
            objectiveSets = _.groupBy(cards, 'objectiveSetNumber');

        _.forEach(objectiveSets, (cards, number) => {
            let
                objectiveCard = _.find(cards, 'objectiveSetSequence', 1),
                types = _.groupBy(cards, 'type'),
                objectiveSetStats,
                typeStats;

            if (objectiveCard == null) {
                return true;
            }

            objectiveSetStats = _.reduce(
                cards,
                (result, card) => {
                    _.forEach(STATS_FIELD_MAP, (fieldPath, fieldName) => {
                        let
                            fieldResult = result[fieldName],
                            fieldValue = _.get(card, fieldPath);

                        if (fieldValue == null || fieldValue == 'X') {
                            return true;
                        }

                        if (fieldResult == null) {
                            fieldResult = result[fieldName] = {
                                count: 0,
                                total: 0,
                                average: 0,
                                max: null,
                                min: null
                            };
                        }

                        fieldResult.count++;
                        fieldResult.total += fieldValue;
                        fieldResult.average = _.round(fieldResult.total / fieldResult.count, 1);
                        fieldResult.max = Math.max(fieldResult.max, fieldValue);
                        fieldResult.min = Math.min(fieldResult.min == null ? Infinity : fieldResult.min, fieldValue);
                    });

                    return result;
                },
                {
                    count: cards.length
                }
            );

            typeStats = _.reduce(
                types,
                (result, typeCards, type) => {
                    let
                        typeResult = result[type] = {
                            count: typeCards.length
                        };

                    _.forEach(STATS_BY_TYPE_FIELD_MAP[type], (fieldPath, fieldName) => {
                        let
                            fieldTypeResult = typeResult[fieldName] = {
                                count: 0,
                                total: 0,
                                average: 0,
                                max: null,
                                min: null
                            };

                        _.forEach(typeCards, (typeCard) => {
                            let
                                fieldValue = _.get(typeCard, fieldPath);

                            if (fieldValue == null || fieldValue == 'X') {
                                return true;
                            }

                            fieldTypeResult.count++;
                            fieldTypeResult.total += fieldValue;
                            fieldTypeResult.average = _.round(fieldTypeResult.total / fieldTypeResult.count, 1);
                            fieldTypeResult.max = Math.max(fieldTypeResult.max, fieldValue);
                            fieldTypeResult.min = Math.min(fieldTypeResult.min == null ? Infinity : fieldTypeResult.min, fieldValue);
                        });
                    });

                    return result;
                },
                {}
            );

            objectiveCard.stats = {
                objective: objectiveSetStats,
                type: typeStats
            };
        });

        return when.resolve();
    })
    .then(() => {
        _.forEach(
            _.groupBy(cards, 'product'),
            (cards, product) => {
                product = product.replace('\'', '');
                cards = _.sortByOrder(cards, ['objectiveSetNumber', 'objectiveSetSequence']);
                fs.writeFileSync(
                    path.resolve(__dirname, '../json', `${_.kebabCase(product)}.json`),
                    JSON.stringify(cards, null, 4)
                );
            }
        );
    });