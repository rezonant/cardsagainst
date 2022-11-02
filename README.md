# @/cardsagainst

> [Play Online](https://cardsagainst.rezonant.dev)

An implementation of the popular Cards Against Humanity game that can be played over the Internet. Play with 1-16 players.

# Introduction

This implementation of Cards Against Humanity is modelled after how table play works. Players hold a hand of options across multiple rounds, replenishing their hand as they dispense the kind of crass hilarious answers we all crave.

When players use the answer cards they've been dealt, they are unavailable for use until the deck is reshuffled. This has the effect that you will never experience the same prompt card or answer card twice until all cards are distributed, just as it is when you play a table game of Cards Against Humanity.

The cards included in this game are the official sets, which are licensed under Creative Commons BY-NC-SA. All official card sets are included. You can easily select subsets of those card sets in your game if you want to hone in on a particular topic or game-feel.

The game automatically scales as players join and leave the game. Care is taken to ensure that play is fluid and cohesive even as roster changes happen. You should never lose a fantastic prompt just because someone joined or left the game. 

Care is also taken to ensure your connection to the game is _durable_. You should be able to lose and re-establish connection (say, if you were to travel into a tunnel while on the train) without interrupting the game. Players time out after 30 seconds, allowing play to continue quickly if someone has a problem. By default, players keep their hand if they rejoin after timing out. 

The game uses a simple URL based game sharing mechanism which is made easy-to-use via the Web Share API. Use "Invite Players" to activate Web Share on a game. I encourage you to use Nearby Share or Airdrop to play the game in person with your friends when you don't have a Cards Against Humanity deck handy.

The game tries to work on all screen sizes, but the primary focus is mobile phones in portrait layout. Play the game from your phone while on a voice call with your friends for the best experience.

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

## A leaving player will...

While playing a table game of Cards Against Humanity, you are likely to have players duck in and out, especially during a rowdy game. Keeping a player's hand when they are "out" gets messy fast when a few drinks are involved. The virtual world doesn't have this limitation. By default departing players "Keep Hand". When they come back, they'll have the same cards they had when they left, assuming the deck itself hasn't changed in the mean time.

Choosing "Lose Hand" will burn the cards in a departing player's hand until the deck is next reshuffled (once all cards have been dealt). 

Choosing "Return Hand" will reshuffle the player's hand back into the available cards, making their hand immediately available for draw during rounds.