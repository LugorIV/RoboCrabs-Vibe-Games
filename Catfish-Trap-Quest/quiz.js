(function () {
  "use strict";

  window.RiverFactQuiz = {
    create: function (ctx) {
      var phase = "";
      var remaining = 0;
      var card = null;
      var buttons = [];
      var promptPanel = null;
      var afterAnswer = null;
      var answeredCorrectly = false;

      function removeButtons() {
        for (var i = 0; i < buttons.length; i++) buttons[i].remove();
        buttons = [];
      }

      function removePrompt() {
        if (promptPanel) promptPanel.remove();
        promptPanel = null;
      }

      function answer(index) {
        var correct = index === card.answer;
        answeredCorrectly = correct;
        removeButtons();
        if (!correct) {
          removePrompt();
          phase = "";
          remaining = 0;
          ctx.ui.hud.text("quiz", "");
          var complete = afterAnswer;
          afterAnswer = null;
          if (complete) complete(false);
          return;
        }
        phase = "feedback";
        remaining = 1.4;
        ctx.ui.hud.text("quiz", card.fact);
        ctx.ui.banner("Correct!", { seconds: remaining });
      }

      function openPrompt(text, seconds) {
        promptPanel = ctx.ui.banner(text, { seconds: seconds });
        if (promptPanel) {
          promptPanel.style.top = "50%";
          promptPanel.style.width = "min(90%, 320px)";
          promptPanel.style.maxWidth = "calc(100% - 24px)";
          promptPanel.style.padding = "16px 18px";
          promptPanel.style.boxSizing = "border-box";
          promptPanel.style.whiteSpace = "normal";
          promptPanel.style.overflowWrap = "anywhere";
          promptPanel.style.fontSize = "clamp(20px, 5vmin, 30px)";
          promptPanel.style.lineHeight = "1.2";
          promptPanel.style.color = "#174c70";
          promptPanel.style.background = "#fffaf0";
          promptPanel.style.border = "3px solid #174c70";
          promptPanel.style.borderRadius = "18px";
          promptPanel.style.boxShadow = "0 5px 0 #b9d8df";
          promptPanel.style.textShadow = "none";
          promptPanel.style.webkitTextStroke = "0";
          promptPanel.style.animation = "none";
        }
        return promptPanel;
      }

      function openChoices() {
        phase = "quiz";
        openPrompt(card.question, 3600);
        for (let i = 0; i < card.choices.length; i++) {
          (function (choiceIndex) {
            var button = ctx.ui.button(card.choices[choiceIndex], function () {
              if (phase === "quiz") answer(choiceIndex);
            }, { at: "bottom" });
            button.style.width = "100%";
            button.style.minWidth = "0";
            button.style.padding = "8px 10px";
            button.style.fontSize = "clamp(16px, 4.5vmin, 22px)";
            button.style.whiteSpace = "normal";
            buttons.push(button);
          })(i);
        }
        if (buttons.length) {
          var dock = buttons[0].parentElement;
          dock.style.display = "grid";
          dock.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
          dock.style.width = "min(92vw, 360px)";
          dock.style.gap = "8px";
        }
      }

      return {
        showFact: function (nextCard) {
          removeButtons();
          removePrompt();
          card = nextCard;
          afterAnswer = null;
          answeredCorrectly = false;
          phase = "fact";
          remaining = 3;
          openPrompt(card.fact, remaining);
          ctx.ui.hud.text("quiz", "");
        },
        start: function (nextCard, onComplete) {
          removeButtons();
          removePrompt();
          card = nextCard;
          afterAnswer = onComplete || null;
          answeredCorrectly = false;
          remaining = 0;
          ctx.ui.hud.text("quiz", "");
          openChoices();
        },
        update: function (dt) {
          if (phase === "quiz") return true;
          if (phase === "fact") {
            remaining -= dt;
            if (remaining <= 0) {
              phase = "";
              card = null;
              removePrompt();
            }
            return phase !== "";
          }
          if (phase === "feedback") {
            remaining -= dt;
            if (remaining <= 0) {
              phase = "";
              card = null;
              removePrompt();
              ctx.ui.hud.text("quiz", "");
              var complete = afterAnswer;
              afterAnswer = null;
              if (complete) complete(answeredCorrectly);
            }
            return phase !== "";
          }
          return false;
        },
        reset: function () {
          removeButtons();
          removePrompt();
          phase = "";
          remaining = 0;
          card = null;
          afterAnswer = null;
          answeredCorrectly = false;
          ctx.ui.hud.text("quiz", "");
        }
      };
    }
  };
})();
