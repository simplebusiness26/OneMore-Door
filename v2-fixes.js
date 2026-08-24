'use strict';

// Small post-V2 rules patch kept separate so the mission layer remains easy to review.
(function () {
  const missionChooseDoors = chooseDoors;
  chooseDoors = function (first = false) {
    if (!first && game.coreSecured && game.finalDoorReached && game.lastCheckpoint !== game.room) {
      resetWorld();
      game.lastCheckpoint = game.room;
      showBankDecision();
      return;
    }
    missionChooseDoors(first);
  };
})();
