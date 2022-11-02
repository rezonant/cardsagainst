# @/cardsagainst

> [Play Online](https://cardsagainst.rezonant.dev)

An implementation of the popular Cards Against Humanity game that can be played over the Internet. Play with 1-16 players.

# Rules

This game implements the standard Cards Against Humanity rules, but also supports some additions which make the game work
better with fewer people.

## House Cards Up To

By default, if there are less than 4 players (3 answerers and one Czar), random "house cards" are added to the answer set 
to make it interesting. This makes the game scale down to as little as 1 player. Human players need to beat random to win,
and the Czar has no idea which answers are human and which are robot. Consider it the ultimate Turing Test, or at least 
an impossible to solve Captcha.

You can change this value by setting how many players the house will fill. Setting 3 (the default) will add 2 answers 
in a two player (1 czar, 1 answerer) round, or 1 answer in a three player (1 czar, 2 answerer) round.

You mostly don't need to worry about this setting, because if you don't have 4 human players, you certainly want this
setting (because it isn't fun without it), but it's configurable nonetheless.

## Czar Plays Up To

Traditionally in Cards Against Humanity, the Czar never plays an answer. Some variations of the game allow it though
for more variety. By default, the Czar never plays, but similar to "House Cards Up To", you can allow the Czar to play 
up to a maximum player count.

## Czar Is...

In addition to the traditional Czar rules, you can also choose to allow all players to _vote_ on the best answer. If 
a tie happens, an instant runoff vote is performed.