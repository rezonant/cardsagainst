import * as webrpc from '@astronautlabs/webrpc';
import { Observable } from 'rxjs';

export interface Player {
    id: string;
    displayName: string;
}

export interface GameRules {
    leavingPlayerWill: 'keep-hand' | 'lose-hand' | 'return-hand';
    czarIs: 'a-player' | 'the-players' | 'the-audience';
    czarCanDeclareADraw: boolean;
    czarPlaysUpTo: number;
    housePlaysUpTo: number;
}

export interface Round {
    tsarPlayerId: string;
    phase: 'answering' | 'judging' | 'finished';
    prompt: string;
    promptDeck: Deck;
    pick: number;
    host: Player;
    players: Player[];
    answers: Answer[];
    winner?: Player;
    winningAnswer?: Answer;
    gameRules: GameRules;
    enabledDecks: Deck[];
}

export interface AnswerCard {
    id: string;
    text: string;
    deck: Deck;
}

export interface JudgementRequest {
    answers: Answer[];
}

export interface Answer {
    id: string;
    answerCards: AnswerCard[];
    votes: string[];
}

@webrpc.Remotable()
export abstract class PlayerSession {
    abstract get cardsChanged(): Observable<AnswerCard[]>;
    abstract get judgementRequested(): Observable<JudgementRequest>;
    abstract get snackMessageReceived(): Observable<string>;

    abstract submitAnswer(answerCards: AnswerCard[]): Promise<void>;
    abstract pickAnswer(answer: Answer): Promise<void>;
    abstract revealAnswer(answer: Answer): Promise<void>;
    abstract startNextRound();
    abstract getHand(): Promise<AnswerCard[]>;
    abstract leaveGame(): Promise<void>;
    abstract setEnabledDecks(decks: Deck[]): Promise<void>;
    abstract setGameRules(rules: GameRules): Promise<void>;
}

@webrpc.Remotable()
export abstract class Game {
    abstract get roundChanged(): Observable<Round>;
    abstract getId(): Promise<string>;
    abstract getGameRules(): Promise<GameRules>;
    abstract join(id: string, displayName: string): Promise<PlayerSession>;
    abstract getPreviousRounds(): Promise<Round[]>;
    abstract getEnabledDecks(): Promise<Deck[]>;
}

@webrpc.Name('dev.rezonant.cardsagainst')
export abstract class CardsAgainstService extends webrpc.Service {
    abstract findSession(id: string): Promise<Game>;
    abstract createSession(): Promise<Game>;
    abstract getDecks(): Promise<Deck[]>;
}

export interface Deck {
    id: string;
    name: string;
    description: string;
    official: boolean;
    promptCount: number;
    answerCount: number;
}