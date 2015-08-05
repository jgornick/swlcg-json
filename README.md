# Star Wars LCG JSON

The purpose of this project is provide a community driven card database for the Star Wars LCG card game from Fantasy Flight Games.

The initial creation of this database is from the Star Wars LCG OCTGN sets catalog. Most of the information is verbatim, however, there were some tweaks that were made to some fields.

## Documentation

More to come...

In the mean time, view the ```/json``` directory and ```schema/card.json```.

## TODO

* Add enhancement target aspect field which is a standard set of targeted aspected the card enhances.
* Improve referenced traits parsing for the "Force" trait.

    ```
    (?!\s(?:eht fo ecnalaB|.*?timmoc|eht morf devomer|eht morf tinu tegrat a evomer)
    (?<!(?:Balance of the|commit?*.|removed from the|remove a target unit from the)\\s?)
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
