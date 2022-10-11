import { Component } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { RPCSession } from "@astronautlabs/webrpc";
import { Answer, AnswerCard, PlayerSession, Round, Session } from "@cardsagainst/backend";
import { GameService } from "../game.service";
import { Card, Player, timeout } from "../types";
import { v4 as uuid } from 'uuid';

const QUESTIONS = [
    "...and then there was the time I found _____ on the root partition.",
    "140 characters is just enough to explain _____.",
    "_____ - the idiot's guide to _____ and _____.",
    "_____ all the way down.",
    "_____ as a service.",
    "_____ dooms any project to epic failure.",
    "_____ Driven Development.",
    "_____ is a feature, not a bug.",
    "_____ is for closers.",
    "_____ is the new _____.",
    "_____ is weaponized privilege.",
    "_____ is webscale.",
    "_____ or it didn't happen.",
    "_____ with one weird trick.",
    "_____, as one does.",
    "_____, for some values of _____.",
    "_____, is that even HA?",
    "_____, the only thing worse than recruiting spam.",
    "A sales rep just tried to pitch me on _____; I told them we already have _____.",
    "Accidental _____.",
    "After _____ came up, the retrospective really went downhill.",
    "All that we had to do to halve our response times was implement _____.",
    "Amazon built a datacenter on the moon to lessen the risk of _____ causing problems.",
    "Apple just patented _____.",
    "Ask Me Anything about _____.",
    "But Google is using _____ so we should too!",
    "Called on account of _____.",
    "Chef convergence failed due to _____.",
    "Continuous _____.",
    "DevOps: Now with 100% more _____!",
    "Did you know that we have _____ on pager rotation?",
    "Disrupting the established players in _____ via _____.",
    "Doge _____.",
    "Employees must _____ before returning to work.",
    "Enterprise _____ in the cloud.",
    "Enterprise-ready _____.",
    "Epic yak-shave caused by _____.",
    "Etsy says we should _____ everything.",
    "Every time someone brings up _____, I throw up a little in my mouth.",
    "Facebook has acquired _____ for $10b and _____.",
    "Free as in _____.",
    "Glitter-bombed with _____.",
    "Hi, I'm Troy McClure. You may remember me from such commit messages as _____ and _____.",
    "How even is _____ formed?",
    "I came up with an awesome regex that converts _____ to _____.",
    "I can haz _____.",
    "I don't own any jeans skinny enough to wear to a _____ meetup.",
    "I ended up having to buy a replacement _____ on eBay.",
    "I find Java to be way too much like _____.",
    "I got paged at 3am because of _____.",
    "I saw the best minds of my generation _____.",
    "I think maybe I'll leave _____ off my resumé.",
    "If _____ is the answer, you are asking the wrong question.",
    "If we make this deadline, Management has promised us _____.",
    "If you're _____, you're gonna have a bad time.",
    "In order to improve security, we're upgrading to _____.",
    "In the next planning session, we'll cover _____ and _____.",
    "It figures - an article about our _____ was posted just as we're pivoting to _____.",
    "It turns out that the button labeled \"Don't Push\" actually does _____.",
    "It worked on my _____.",
    "It's dangerous to go alone; take _____.",
    "It's like trying to herd _____.",
    "Last week, I created a Chef recipe for _____; this week, it's an entire cookbook for _____. Automation FTW!",
    "Main benefits of automation: _____ and _____.",
    "Management just told me I need to get certified in _____.",
    "Management said it's OK to deploy _____ at 5pm on Friday",
    "Marketing says we're leaders in the _____ space, but I think it's more accurate to say we specialize in _____.",
    "My eyes started bleeding when I opened the editor and saw _____.",
    "My Linkedin Endorsements include _____.",
    "My next blog post will be about how we used _____ to create _____.",
    "My two most indispensable tools are _____ and _____.",
    "No route to host: _____.",
    "Nobody ever got fired for buying _____.",
    "Our app is like _____, but for _____.",
    "Our competitive advantage is our _____.",
    "Our entire app is geared towards providing _____.",
    "Our greatest achievement in the last year is _____.",
    "Our production backups are stored using _____.",
    "Pour one out for _____.",
    "Put some _____ on it",
    "Restoring from backups failed due to _____.",
    "RIAA is suing me for downloading _____.",
    "Robots are going to make _____ obsolete.",
    "Root cause of the outage? _____.",
    "Running Windows in production leads to _____.",
    "Security? We've got that! We use _____.",
    "So, I was using Wireshark to check network traffic... Did you know we have _____ in production?",
    "Sweet! I just found a Puppet module for _____!",
    "The hardest problems in computer science are naming things, cache invalidation, and _____.",
    "The Internet is for cat memes and _____,",
    "The Internet of Things will be controlled by _____.",
    "The most stable part of our infrastructure? _____",
    "The only thing necessary for evil to triumph is _____.",
    "The production datacenter burned down because of _____.",
    "The status console is green, but I can't access _____.",
    "The two pillars of our Continuous Deployment pipeline are _____ and _____.",
    "There was no good solution for _____, so we built our own.",
    "This account has exceeded the maximum number of _____.",
    "This isn't going to be all unicorns and _____.",
    "Time to schedule the postmortem for _____ .",
    "To secure our next round of funding, Management says we need _____.",
    "Uber is on surge pricing because of _____.",
    "WARN: _____ has been deprecated.",
    "We don't need _____ - we have _____ !",
    "We really need to open-source our _____.",
    "We replaced our _____ with _____.",
    "We run production _____ and _____.",
    "When I hooked the 3D printer up to the Internet, it accidentally created _____.",
    "When I told Jez Humble about our _____, he actually cried.",
    "When I was a kid we didn't have _____.",
    "When I write a book about my experiences, it'll be called \"_____, the good parts\"",
    "Who would have known that _____ could destroy an entire datacenter?",
    "Will merge pull requests for _____.",
    "Wrap it with the _____ duct tape.",
    "xkcd.com just made a hilarious comic making fun of _____.",
    "You know what our app needs? More _____, less _____.",
    "You should think of your servers like _____ and not like _____.",
    "Zero-day _____.",

];

@Component({
    selector: 'ca-game',
    templateUrl: './game.component.html',
    styleUrls: ['./game.component.scss']
})
export class GameComponent {
    constructor(private game: GameService, private route: ActivatedRoute, private router: Router) {

    }

    private playerId: string;
    private playerName: string;
    private session: Session;
    private player: PlayerSession;

    async ngOnInit() {
        await this.game.ready;

        if (localStorage['ca:playerId'])
            this.playerId = localStorage['ca:playerId'];
        else
            this.playerId = localStorage['ca:playerId'] = uuid();
        
        console.log(`Player ID: ${this.playerId}`);

        if (localStorage['ca:playerName'])
            this.playerName = localStorage['ca:playerName'];
        else
            this.playerName = localStorage['ca:playerName'] = prompt('What would you like to be called?')
        
        this.route.paramMap.subscribe(async params => {
            this.session = await this.game.service.findSession(params.get('id'));

            if (!this.session) {
                alert(`Failed to find game!`);
                this.router.navigateByUrl('/');
            }
            this.session.roundChanged.subscribe(round => {
                let lastPhase = this.round?.phase;

                if (lastPhase !== round.phase) {            
                    this.pickedCards = [];
                }

                this.round = round
                console.log(`Round updated:`);
                console.dir(this.round);
            });
            let gameId = await this.session.getId();

            console.log(`Joining game as ${this.playerId} ("${this.playerName}")...`);
            this.player = await this.session.join(this.playerId, this.playerName);
            if (!this.player) {
                alert(`Failed to join game!`);
                this.router.navigateByUrl('/');
            }
            console.log(`Joined game successfully.`);

            this.player.cardsChanged.subscribe(cards => {
                this.hand = cards;
                
                console.log(`Player hand changed:`);
                console.dir(this.hand);
            });
            this.hand = await this.player.getHand()
            console.log(`Player hand:`);
            console.dir(this.hand);
        });
    }
    
    hand: AnswerCard[] = [];
    round: Round;

    cards: Card[] = null;
    players: Player[] = [
        {
            name: "Player 1",
            cards: []
        },
        {
            name: "Player 2",
            cards: []
        }
    ];

    questions: Card[];
    answers: Card[];

    currentPlayer = 0;

    pickedCards: AnswerCard[] = [];

    get tsar() {
        if (!this.round)
            return null;
        return this.round.players.find(x => x.id === this.round.tsarPlayerId);
    }

    async startNextRound() {
        await this.player.startNextRound();
    }

    get isHost() {
        return this.round.host.id === this.playerId;
    }

    get allRevealed() {
        return !this.round.answers.some(answer => answer.answerCards.some(card => !card.text));
    }
    get imJudging() {
        return this.round.tsarPlayerId === this.playerId;
    }

    isLastCardOfAnswer(answer: Answer, card: AnswerCard) {
        return answer.answerCards[answer.answerCards.length - 1] === card;
    }

    get winningMessage() {
        return this.round.winner.id === this.playerId ? `You won!` : `${this.round.winner.displayName} won!`;
    }

    get judgingMessage() { 
        return this.imJudging ? 'You are judging.' : `${this.tsar.displayName} is judging.`;
    }

    async revealAnswer(answer: Answer) {
        await this.player.revealAnswer(answer);
    }

    pickCard(card: AnswerCard) {
        this.pickedCards.push(card);
    }

    async pickAnswer(answer: Answer) {
        await this.player.pickAnswer(answer);
    }

    async submitAnswer() {
        await this.player.submitAnswer(this.pickedCards);
        //this.pickedCards = [];
    }

    get answerSets() {
        return this.round.answers.concat(this.round.answers);
    }

    isLastPicked(card: AnswerCard) {
        return this.pickedCards[this.pickedCards.length - 1] === card;
    }

    isPicked(card: AnswerCard) {
        return this.pickedCards.includes(card);
    }

    get allPicked() {
        return this.pickedCards.length >= this.round?.pick;
    }
    unpickCard(card: AnswerCard) {
        this.pickedCards = this.pickedCards.filter(x => x !== card);
    }

    dealCards(amount: number = 10) {

    }

    async startRound() {
        let question = this.questions[Math.floor(this.questions.length * Math.random())]

        this.cards = []
        await timeout(1);
        this.cards.push(question);
    }

    reset() {
        this.cards.pop();
    }

    playCard() {
        this.cards.push({
            type: 'answer',
            message: 'This groovy new thing called LSD.'
        });
    }
}