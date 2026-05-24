CREATE DATABASE IF NOT EXISTS yoruzone
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE yoruzone;

CREATE TABLE IF NOT EXISTS Utilizador (
  Id           INT          NOT NULL AUTO_INCREMENT,
  Nick         VARCHAR(50)  NOT NULL,
  Email        VARCHAR(100) NOT NULL,
  PasswordHash VARCHAR(255) NOT NULL,
  Creditos     INT          NOT NULL DEFAULT 800,
  Criado_Em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (Id),
  UNIQUE KEY uq_nick  (Nick),
  UNIQUE KEY uq_email (Email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Estado_Jogo (
  Id          INT         NOT NULL AUTO_INCREMENT,
  Nome_Estado VARCHAR(50) NOT NULL,
  PRIMARY KEY (Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO Estado_Jogo (Id, Nome_Estado) VALUES
  (1, 'Vitória'),
  (2, 'Derrota');

CREATE TABLE IF NOT EXISTS Arma (
  Id          INT            NOT NULL AUTO_INCREMENT,
  Nome        VARCHAR(50)    NOT NULL,
  Dano        INT            NOT NULL,
  Cadencia_Ms INT            NOT NULL,
  Municao_Max INT            NOT NULL,
  Recarga_Ms  INT            NOT NULL DEFAULT 1500,
  Recuo_Max   DECIMAL(5, 3)  NOT NULL,
  Auto        TINYINT(1)     NOT NULL DEFAULT 0,
  Preco       INT            NOT NULL DEFAULT 0,
  PRIMARY KEY (Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO Arma (Id, Nome, Dano, Cadencia_Ms, Municao_Max, Recarga_Ms, Recuo_Max, Auto, Preco) VALUES
  (1, 'Classic',  26,  400, 12, 1500, 0.018, 0,    0),
  (2, 'Frenzy',   20,  105, 13, 1400, 0.042, 1,  450),
  (3, 'Ghost',    30,  350, 15, 1200, 0.022, 0,  500),
  (4, 'Sheriff',  55,  750,  6, 2200, 0.055, 0,  800),
  (5, 'Vandal',   40,  250, 25, 2500, 0.065, 1, 2900),
  (6, 'Phantom',  35,  200, 30, 2300, 0.048, 1, 2900),
  (7, 'Operator', 150, 1500, 5, 3500, 0.008, 0, 4700);

CREATE TABLE IF NOT EXISTS Habilidade (
  Id           INT          NOT NULL AUTO_INCREMENT,
  Tecla        CHAR(1)      NOT NULL,
  Nome         VARCHAR(50)  NOT NULL,
  Descricao    VARCHAR(255) NOT NULL,
  Cooldown_Ms  INT          NOT NULL DEFAULT 0,
  Max_Cargas   INT          NOT NULL DEFAULT 1,
  PRIMARY KEY (Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO Habilidade (Id, Tecla, Nome, Descricao, Cooldown_Ms, Max_Cargas) VALUES
  (1, 'Q', 'Blindside',         'Lança uma granada de flash que cega inimigos com linha de visão direta.',     20000, 2),
  (2, 'E', 'Gatecrash',         'Coloca um marcador. Prime E novamente para teleportar até ele.',              35000, 1),
  (3, 'C', 'Fakeout',           'Envia um clone que caminha para a frente durante 3 segundos.',                25000, 2),
  (4, 'X', 'Dimensional Drift', 'Fica invisível durante 10 segundos. Não podes disparar neste estado.',           0, 1);

CREATE TABLE IF NOT EXISTS Jogo (
  Id         INT         NOT NULL AUTO_INCREMENT,
  Data       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Lobby_Code VARCHAR(20) NULL,
  PRIMARY KEY (Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Detalhes_Jogo (
  Id              INT NOT NULL AUTO_INCREMENT,
  Id_Jogo         INT NOT NULL,
  Id_Jogador      INT NOT NULL,
  Id_Estado       INT NOT NULL,
  Rondas_Ganhas   INT NOT NULL DEFAULT 0,
  Kills           INT NOT NULL DEFAULT 0,
  Creditos_Gastos INT NOT NULL DEFAULT 0,
  PRIMARY KEY (Id),
  CONSTRAINT fk_dj_jogo     FOREIGN KEY (Id_Jogo)    REFERENCES Jogo(Id)        ON DELETE CASCADE,
  CONSTRAINT fk_dj_jogador  FOREIGN KEY (Id_Jogador) REFERENCES Utilizador(Id)  ON DELETE CASCADE,
  CONSTRAINT fk_dj_estado   FOREIGN KEY (Id_Estado)  REFERENCES Estado_Jogo(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_dj_jogador ON Detalhes_Jogo (Id_Jogador);
CREATE INDEX IF NOT EXISTS idx_dj_jogo    ON Detalhes_Jogo (Id_Jogo);
