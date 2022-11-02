import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GameService } from './game.service';
import { v4 as uuid } from 'uuid';
import { Player } from '@cardsagainst/backend';
import { MatDialog } from '@angular/material/dialog';
import { SettingsComponent } from './settings/settings.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  constructor(
    private game: GameService,
    private router: Router,
    private matDialog: MatDialog
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

  get isInGame() {
    return !!this.game.session;
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

  changeName() {
    let newDisplayName = prompt("What do you want to be called?", this.displayName);
    if (newDisplayName) {
      window.localStorage['ca:playerName'] = newDisplayName;
      this.game.session.join(this.playerId, newDisplayName);
    }
  }

  async leaveGame() {
    await this.game.playerSession.leaveGame();
    this.game.session = null;
    this.game.playerSession = null;
    this.router.navigateByUrl(`/`);
  }

  showSettings() {
    this.matDialog.open(SettingsComponent);
  }

  invite() {
    navigator.share({
      title: `Cards Against The Internet`,
      url: window.location.href
    });
  }
}
