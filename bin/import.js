import fs from 'fs';
import path from 'path';

import _ from 'lodash';
import when from 'when';
import keys from 'when/keys';
import pipeline from 'when/pipeline';
import async from 'async-p';
import program from 'commander';
import glob from 'glob';
import knex from 'knex';

program
    .description('Import the Star Wars: The Card Game JSON data into MongoDB.')
    .option('-p, --path <path>', 'The path to the JSON directory.')
    .parse(process.argv);

let
    files = glob.sync(path.resolve(process.cwd(), program.path, '**/*.json'));

/**
 * Perform an "Upsert" using the "INSERT ... ON CONFLICT ... " syntax in PostgreSQL 9.5
 * @link http://www.postgresql.org/docs/9.5/static/sql-insert.html
 * @author https://github.com/plurch
 *
 * @param {string} tableName - The name of the database table
 * @param {string} conflictTarget - The column in the table which has a unique index constraint
 * @param {Object} itemData - a hash of properties to be inserted/updated into the row
 * @returns {Promise} - A Promise which resolves to the inserted/updated row
 */
 function upsertItem(db, tableName, conflictTarget, itemData) {
    if (_.isString(conflictTarget)) {
        conflictTarget = [conflictTarget];
    }

    let exclusions = _.difference(_.keys(itemData), conflictTarget)
       .map(c => db.raw('?? = EXCLUDED.??', [c, c]).toString())
       .join(",");

    let insertString = db(tableName).insert(itemData).toString().replace(/\$\{s\}/gm, '\\');
    let conflictString = db.raw(` ON CONFLICT (??) DO UPDATE SET ${exclusions};`, [conflictTarget]).toString();
    let query = (insertString + conflictString).replace(/\?/g, '\\?');

    return db.raw(query)
        .on('query', q => console.log(q.sql));
}

pipeline(
    [
        (context) => {
            context.db = knex({
                client: 'pg',
                connection: 'postgres://swlcg:swlcg@localhost/swlcg'
            });

            return context;
        },

        (context) => {
            return async.each(files, (file) => {
                return when.promise((resolve, reject) => {
                    fs.readFile(file, (error, cards) => {
                        cards = JSON.parse(cards);
                        _.forEach(cards, (card) => context.cards.push(card));
                        resolve();
                    });
                });
            })
                .then(() => context);
        },

        (context) => {
            return async.eachSeries(
                context.cards,
                (card) => {
                    let
                        abilityKeywords = _.map(card.abilities.keywords, (value) => {
                            let
                                newValue = {};

                            newValue.cardNumber = card.number;
                            newValue.keyword = _.result(value, 'keyword', null);
                            newValue.data = JSON.stringify(_.omit(value, 'keyword'));

                            return newValue;
                        }),
                        objectiveSetMetrics = _.reduce(
                            _.result(card.stats, 'objective', {}),
                            (result, value, key) => {
                                if (card.objectiveSetNumber == null) {
                                    return result;
                                }

                                let
                                    newValue = {};

                                newValue.objectiveSetNumber = card.objectiveSetNumber;
                                newValue.name = _.snakeCase(key);
                                newValue.count = _.result(value, 'count', value);
                                newValue.sum = _.result(value, 'sum', value);
                                newValue.average = _.result(value, 'average', value);
                                newValue.min = _.result(value, 'min', value);
                                newValue.max = _.result(value, 'max', value);

                                result.push(newValue);
                                return result;
                            },
                            []
                        ),
                        objectiveSetCardTypeMetrics = _.reduce(
                            _.result(card.stats, 'type', {}),
                            (result, cardTypeStats, cardType) => {
                                if (card.objectiveSetNumber == null) {
                                    return result;
                                }

                                let
                                    newValue = {};

                                newValue.objectiveSetNumber = card.objectiveSetNumber;
                                newValue.type = cardType;

                                _.each(cardTypeStats, (value, key) => {
                                    newValue.name = _.snakeCase(key);
                                    newValue.count = _.result(value, 'count', value);
                                    newValue.sum = _.result(value, 'sum', value);
                                    newValue.average = _.result(value, 'average', value);
                                    newValue.min = _.result(value, 'min', value);
                                    newValue.max = _.result(value, 'max', value);
                                });

                                result.push(newValue);
                                return result;
                            },
                            []
                        );

                    card.normalUnitDamage = _.result(card.normalCombatIcons, 'unitDamage', null);
                    card.normalBlastDamage = _.result(card.normalCombatIcons, 'blastDamage', null);
                    card.normalTactics = _.result(card.normalCombatIcons, 'tactics', null);
                    card.edgeEnabledUnitDamage = _.result(card.edgeEnabledCombatIcons, 'unitDamage', null);
                    card.edgeEnabledBlastDamage = _.result(card.edgeEnabledCombatIcons, 'blastDamage', null);
                    card.edgeEnabledTactics = _.result(card.edgeEnabledCombatIcons, 'tactics', null);

                    card.abilityTypes = card.abilities.types;
                    card.abilityTraits = card.abilities.traits;
                    card.abilityReferencedTraits = card.abilities.referencedTraits;

                    card.abilityScenarios = card.abilities.scenarios;

                    card = _.omit(card, [
                        'octgnId',
                        'productOctgnId',
                        'normalCombatIcons',
                        'edgeEnabledCombatIcons',
                        'abilities',
                        'stats'
                    ]);

                    card = _.mapValues(card, (value, key) => {
                        if (_.isBoolean(value)) {
                            value = +value;
                        }

                        let isValueXField = _.includes(
                            ['cost', 'damageCapacity', 'forceIcons', 'resourceValue', 'edgePriorityNumber'],
                            key
                        );

                        if (isValueXField && value == 'X') {
                            value = -1
                        }

                        return value;
                    });

                    card = _.mapKeys(card, (value, key) => _.snakeCase(key));

                    return upsertItem(
                        context.db,
                        'cards',
                        ['number', 'objective_set_number', 'objective_set_sequence'],
                        card
                    )
                        .then(() => async.eachSeries(
                            objectiveSetMetrics,
                            (item) => upsertItem(
                                context.db,
                                'objective_set_metrics',
                                ['objective_set_number', 'name'],
                                _.mapKeys(item, (value, key) => _.snakeCase(key))
                            )
                        ))
                        .then(() => async.eachSeries(
                            objectiveSetCardTypeMetrics,
                            (item) => upsertItem(
                                context.db,
                                'objective_set_card_type_metrics',
                                ['objective_set_number', 'type', 'name'],
                                _.mapKeys(item, (value, key) => _.snakeCase(key))
                            )
                        ))
                        .then(() => async.eachSeries(
                            abilityKeywords,
                            (item) => upsertItem(
                                context.db,
                                'card_ability_keywords',
                                ['card_number', 'keyword'],
                                _.mapKeys(item, (value, key) => _.snakeCase(key))
                            )
                        ));
                }
            )
                .then(() => {
                    console.log('Done inserting!');
                    return context;
                });
        }
    ],
    {
        db: null,
        cards: []
    }
)
    .catch((error) => {
        console.log('------------------------------------------------------------');
        console.log('Error!', error);
        console.log('------------------------------------------------------------');
    })
    .then((context) => {
        console.log('Done!');
    });