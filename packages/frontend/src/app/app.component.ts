import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GameService } from './game.service';
import { v4 as uuid } from 'uuid';

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

  async ngOnInit() {
    this.game.init();
  }
}
