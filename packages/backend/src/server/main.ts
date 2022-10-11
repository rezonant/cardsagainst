import "@alterior/platform-nodejs";

import { Application } from '@alterior/runtime';
import { WebService, WebServerEngine, Get, WebEvent, WebServer } from '@alterior/web-server';
import * as webrpc from '@astronautlabs/webrpc';
import { RPCSession, SocketChannel } from '@astronautlabs/webrpc';
import * as Interface from '../common';
import { v4 as uuid } from 'uuid';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import * as fs from 'fs';
import path from 'path';
import { ExpressEngine } from '@alterior/express';

WebServerEngine.default = ExpressEngine;

export interface CardSet {
    name: string;
    description: string;
    official: boolean;
    white: WhiteCard[];
    black: BlackCard[];
}

export interface WhiteCard {
    text: string;
    pack: number;
}

export interface BlackCard {
    text: string;
    pick: number;
    pack: number;
}

export class PlayerSession extends Interface.PlayerSession {
    constructor(readonly session: Session, readonly player: Interface.Player) {
        super();
    }

    private _judgementRequested = new Subject<Interface.JudgementRequest>();
    private _judgementRequested$ = this._judgementRequested.asObservable();
    private _cardsChanged = new Subject<Interface.AnswerCard[]>();
    private _cardsChanged$ = this._cardsChanged.asObservable();
    answerCards: Interface.AnswerCard[] = [];

    @webrpc.Event()
    get judgementRequested() {
        return this._judgementRequested$;
    }

    @webrpc.Method()
    override async pickAnswer(answer: Interface.Answer) {
        await this.session.pickAnswer(this, answer);
    }

    @webrpc.Event()
    get cardsChanged(): Observable<Interface.AnswerCard[]> {
        return this._cardsChanged$;
    }

    @webrpc.Method()
    override async startNextRound() {
        this.session.startNextRound(this);
    }

    @webrpc.Method()
    override async submitAnswer(answerCards: Interface.AnswerCard[]): Promise<void> {
        this.session.submitPlayerAnswer(this, answerCards);
        this.answerCards = this.answerCards.filter(x => answerCards.some(y => y.id !== x.id));
        this._cardsChanged.next(this.answerCards);
    }

    @webrpc.Method()
    override async revealAnswer(answer: Interface.Answer) {
        this.session.revealAnswer(this, answer);
    }

    @webrpc.Method()
    override async getHand(): Promise<Interface.AnswerCard[]> {
        return this.answerCards;
    }

    addCard(card: Interface.AnswerCard) {
        this.answerCards.push(card);
        this._cardsChanged.next(this.answerCards);
    }
}

export interface PendingAnswer {
    player: PlayerSession;
    id: string;
    answerCards: Interface.AnswerCard[];
}

export class Session extends Interface.Session {
    constructor(readonly service: CardsAgainstService, readonly id: string) {
        super();
        this.availableAnswerCards = this.service.availableAnswers;
        this.availablePrompts = this.service.availablePrompts;
    }

    playerMap = new Map<string, PlayerSession>();
    round: Interface.Round;
    pendingAnswers: PendingAnswer[];
    host: PlayerSession;

    get players() {
        return Array.from(this.playerMap.values());
    }

    private _roundChanged = new BehaviorSubject<Interface.Round>(undefined);
    private _roundChanged$ = this._roundChanged.asObservable();

    @webrpc.Event()
    get roundChanged(): Observable<Interface.Round> {
        return this._roundChanged$;
    }

    startNextRound(player: PlayerSession) {
        if (this.round.phase !== 'finished')
            throw new Error(`The current round isn't finished yet!`);
        if (this.round.host.id !== player.player.id)
            throw new Error(`You must be the host to start the next round`);

        this.startRound();
    }

    tsarPlayerIndex = -1;
    availablePrompts: BlackCard[];

    pickPrompt() {
        let cardIndex = Math.random() * this.availablePrompts.length | 0;
        let card = this.availablePrompts[cardIndex];
        this.availablePrompts.splice(cardIndex, 1);
        return card;
    }

    startRound() {
        let prompt = this.pickPrompt();

        console.log(`[CAH] Round starting: ${prompt.text}`);
        this.round = {
            host: this.host.player,
            answers: [],
            phase: 'answering',
            players: this.players.map(x => x.player),
            prompt: prompt.text,
            pick: prompt.pick,
            tsarPlayerId: this.players[(this.tsarPlayerIndex = (this.tsarPlayerIndex + 1) % this.players.length)].player.id,
            winner: undefined
        }
        this._roundChanged.next(this.round);
    }

    async revealAnswer(player: PlayerSession, revealedAnswer: Interface.Answer) {
        let answer = this.round.answers.find(x => x.id === revealedAnswer.id);
        let pendingAnswer = this.pendingAnswers.find(x => x.id === revealedAnswer.id);

        answer.answerCards = pendingAnswer.answerCards;
        this._roundChanged.next(this.round);
    }

    async pickAnswer(player: PlayerSession, answer: Interface.Answer) {
        if (this.round.phase !== 'judging')
            throw new Error(`It's not time to pick an answer!`);

        if (this.round.answers.some(x => !x.answerCards))
            throw new Error(`Not all answers have been revealed yet!`);

        let pendingAnswer = this.pendingAnswers.find(x => x.player === player);
        this.round.phase = 'finished';
        this.round.winner = pendingAnswer.player.player;
        this._roundChanged.next(this.round);
    }

    async submitPlayerAnswer(player: PlayerSession, answerCards: Interface.AnswerCard[]) {
        if (this.pendingAnswers.some(x => x.player === player))
            throw new Error(`You've already submitted an answer`);

        let id = uuid();
        this.pendingAnswers.push({ id, player, answerCards });
        this.round.answers.push({ id, answerCards: undefined });
        this._roundChanged.next(this.round);
        this.dealCards(player);

        if (!this.players.some(x => this.hasAnswered(x))) {
            this.round.phase = 'judging';
            this._roundChanged.next(this.round);
        }
    }
    
    hasAnswered(player: PlayerSession) {
        return this.round.answers.some(x => x.id === player.player.id);
    }

    @webrpc.Method()
    async getId(): Promise<string> {
        return this.id;
    }

    @webrpc.Method()
    async join(id: string, displayName: string): Promise<Interface.PlayerSession> {
        let firstPlayer = this.playerMap.size === 0;
        let session = this.playerMap.get(id);

        if (!session) {
            session = new PlayerSession(this, { id, displayName });
            this.dealCards(session);
            this.playerMap.set(id, session);
            console.log(`[Game ${this.id}] Player ${id} ("${displayName}") has joined.`);
        } else {
            console.log(`[Game ${this.id}] Player ${id} ("${displayName}") has rejoined.`);
        }

        if (firstPlayer) {
            this.host = session;
            this.startRound();
        }
    
        return session;
    }

    availableAnswerCards: Interface.AnswerCard[];

    dealCards(player: PlayerSession) {
        while (player.answerCards.length < 5) {
            let index = Math.random() * this.availableAnswerCards.length | 0;
            let card = this.availableAnswerCards[index];
            player.addCard(card);
            this.availableAnswerCards.splice(index, 1);
        }
    }
}

@WebService({
    server: {
        port: 3044
    }
})
@webrpc.Name('dev.rezonant.cardsagainst')
export class CardsAgainstService extends Interface.CardsAgainstService {
    async altOnInit() {
        let sets: CardSet[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'cah-cards-full.json')).toString('utf-8'));

        for (let set of sets) {
            this.availablePrompts.push(...set.black);
            this.availableAnswers.push(...set.white.map(x => ({ id: uuid(), ...x })));
        }

        console.log(`Loaded ${this.availablePrompts.length} prompts and ${this.availableAnswers.length} answers.`);
    }

    availablePrompts: BlackCard[] = [];
    availableAnswers: Interface.AnswerCard[] = [];

    @Get()
    async endpoint() {
        if (WebEvent.request.headers.upgrade) {
            let socket = await WebServer.startSocket();
            let session = new RPCSession(new SocketChannel(socket));
            //session.loggingEnabled = true;
            //session.tag = WebEvent.request['ip'];
            session.registerService(CardsAgainstService, () => this);
        }
    }
    
    sessions = new Map<string, Session>;

    @webrpc.Method()
    override async findSession(id: string): Promise<Interface.Session> {
        return this.sessions.get(id);
    }

    @webrpc.Method()
    override async createSession(): Promise<Interface.Session> {
        let session = new Session(this, uuid());
        this.sessions.set(session.id, session);
        return session;
    }
}

Application.bootstrap(CardsAgainstService);