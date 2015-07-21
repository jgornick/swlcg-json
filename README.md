# Star Wars LCG JSON

The purpose of this project is provide a community driven card database for the Star Wars LCG card game from Fantasy Flight Games.

The initial creation of this database is from the Star Wars LCG OCTGN sets catalog. Most of the information is verbatim, however, there were some tweaks that were made to some fields.

## Documentation

More to come...

In the mean time, view the ```/json``` directory.

## TODO

* Add isAffiliationLocked flag to an objective card based on the card text: ```/(.*?) affiliation only\./```
* Add isLimitedToObjectiveDeck flag to an objective card based on the card text: ```Limit 1 per objective deck.```
* Add scenarios which allow one to query cards (objective sets) based on thier abilities in the text of the card.
* Add enhancement target aspect field which is a standard set of targeted aspected the card enhances.

### Card Text Scenarios

```
Deal damage
    \bdeals? (\d+|a) damage\b
Reduce cost
    \breduce(.*?)cost\b
Place token
    \bplace (\d+|a) focus token\b
Remove token
    \bremove (\d+|a) focus token\b
Move token
    \bmove (\d+|a) focus token\b
Draw card
    \bdraw (\d+|a) card\b
Put into play
    \bput(.*?)into play\b
Gains edge
    \bgains([^\.\n]*?)edge\s\(\d+\)
Gains combat icon(s)
    todo
Gains shielding
    todo
Contributes Force
    \bcontributes (.*?) Force\b
```

### Enhancement Parser

```
/Enhance (?:your|a|an|the) (.*?)\./
```

## License and Copyright

Card names and text are all copyright Fantasy Flight Games.

This project is not affiliated with Fantasy Flight Games in any way.

I am providing the JSON files under the public domain license.

## Credit and Inspiration

* Divided by Zer0 amazing work with the [OCTGN version of Star Wars LCG](https://github.com/db0/Star-Wars-LCG-OCTGN).
* [MTG JSON](http://mtgjson.com/).
