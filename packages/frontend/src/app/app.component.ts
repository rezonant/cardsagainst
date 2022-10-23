import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GameService } from './game.service';
import { v4 as uuid } from 'uuid';
import { Player } from '@cardsagainst/backend';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  constructor(
    private game: GameService,
    private router: Router
  ) {

  }

  get displayName() {
    return localStorage['ca:playerName'] ?? '';
  }

  get playerId() {
    return localStorage['ca:playerId'] ?? '';
  }

  get phase() {
    return this.game.round?.phase ?? 'none';
  }

  hasAnswered(player: Player) {
    if (!this.game.round)
      return false;

    return this.game.round.answers.some(x => x.id === player.id);
  }

  isTsar(player: Player) {
    if (!this.game.round)
      return false;

    return this.game.round.tsarPlayerId === player.id;
  }

  isMe(player: Player) {
    return player.id === this.playerId;
  }

  get players() {
    if (!this.game.round)
      return [];
    
    return this.game.round.players;
  }
  
  async ngOnInit() {
    this.game.init();
  }
}
