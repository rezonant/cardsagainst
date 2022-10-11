import * as webrpc from '@astronautlabs/webrpc';
import { Observable } from 'rxjs';

export interface Player {
    id: string;
    displayName: string;
}

export interface Round {
    tsarPlayerId: string;
    phase: 'answering' | 'judging' | 'finished';
    prompt: string;
    pick: number;
    host: Player;
    players: Player[];
    answers: Answer[];
    winner: Player;
}

export interface AnswerCard {
    id: string;
    text: string;
}

export interface JudgementRequest {
    answers: Answer[];
}

export interface Answer {
    id: string;
    answerCards: AnswerCard[];
}

@webrpc.Remotable()
export abstract class PlayerSession {
    abstract get cardsChanged(): Observable<AnswerCard[]>;
    abstract get judgementRequested(): Observable<JudgementRequest>;
    abstract submitAnswer(answerCards: AnswerCard[]): Promise<void>;
    abstract pickAnswer(answer: Answer): Promise<void>;
    abstract revealAnswer(answer: Answer): Promise<void>;
    abstract startNextRound();
    abstract getHand(): Promise<AnswerCard[]>;
}

@webrpc.Remotable()
export abstract class Session {
    abstract get roundChanged(): Observable<Round>;
    abstract getId(): Promise<string>;
    abstract join(id: string, displayName: string): Promise<PlayerSession>;
}

@webrpc.Name('dev.rezonant.cardsagainst')
export abstract class CardsAgainstService extends webrpc.Service {
    abstract findSession(id: string): Promise<Session>;
    abstract createSession(): Promise<Session>;
}