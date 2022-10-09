import "@alterior/platform-nodejs";

import { Application } from '@alterior/runtime';
import { WebService, WebServerEngine, Get, WebEvent, WebServer } from '@alterior/web-server';
import * as webrpc from '@astronautlabs/webrpc';
import { RPCSession, SocketChannel } from '@astronautlabs/webrpc';
import * as Interface from '../common';
import { v4 as uuid } from 'uuid';
import { Subject, Observable } from 'rxjs';
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
    private _judgementRequested = new Subject<Interface.JudgementRequest>();
    private _judgementRequested$ = this._judgementRequested.asObservable();

    get judgementRequested() {
        return this._judgementRequested$;
    }

    async pickAnswer(answer: Interface.Answer) {
        await this.session.pickAnswer(this, answer);
    }

    private _cardsChanged = new Subject<Interface.AnswerCard[]>();
    private _cardsChanged$ = this._cardsChanged.asObservable();

    get cardsChanged(): Observable<Interface.AnswerCard[]> {
        return this._cardsChanged$;
    }

    constructor(readonly session: Session, readonly player: Interface.Player) {
        super();
    }

    answerCards: Interface.AnswerCard[] = [];

    async startNextRound() {
        this.session.startNextRound(this);   
    }

    async submitAnswer(answerCards: Interface.AnswerCard[]): Promise<void> {
        this.session.submitPlayerAnswer(this, answerCards);
        this.answerCards = this.answerCards.filter(x => answerCards.some(y => y.id !== x.id));
        this._cardsChanged.next(this.answerCards);
    }

    async revealAnswer(answer: Interface.Answer) {
        this.session.revealAnswer(this, answer);
    }

    async getHand(): Promise<Interface.AnswerCard[]> {
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
    }

    playerMap = new Map<string, PlayerSession>();
    round: Interface.Round;
    pendingAnswers: PendingAnswer[];
    host: PlayerSession;

    get players() {
        return Array.from(this.playerMap.values());
    }

    private _roundChanged = new Subject<Interface.Round>();
    private _roundChanged$ = this._roundChanged.asObservable();

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

    pickPrompt() {
        return this.service.availablePrompts[Math.random() * this.service.availablePrompts.length | 0];
    }

    startRound() {
        let prompt = this.pickPrompt();

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

    async getId(): Promise<string> {
        return this.id;
    }

    async join(id: string, displayName: string): Promise<Interface.PlayerSession> {
        let session = this.playerMap.get(id);

        if (!session) {
            session = new PlayerSession(this, { id, displayName });
            this.dealCards(session);
            this.playerMap.set(id, session);
        }

        if (this.players.length === 1)
            this.startRound();
    
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
            this.availableAnswers.push(...set.white);
        }

        console.log(`Loaded ${this.availablePrompts.length} prompts and ${this.availableAnswers.length} answers.`);
    }

    availablePrompts: BlackCard[] = [];
    availableAnswers: WhiteCard[] = [];

    @Get()
    async endpoint() {
        if (WebEvent.request.headers.upgrade) {
            let socket = await WebServer.startSocket();
            let session = new RPCSession(new SocketChannel(socket));
            session.registerService(CardsAgainstService, () => this);
        }
    }
    
    sessions = new Map<string, Session>;

    async findSession(id: string): Promise<Interface.Session> {
        return this.sessions.get(id);
    }

    async createSession(): Promise<Interface.Session> {
        let session = new Session(this, uuid());
        this.sessions.set(session.id, session);
        return session;
    }
}

Application.bootstrap(CardsAgainstService);