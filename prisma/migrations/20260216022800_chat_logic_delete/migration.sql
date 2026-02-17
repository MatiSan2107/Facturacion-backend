-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "deletedByCustomer" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_ChatMessage" ("author", "createdAt", "id", "text") SELECT "author", "createdAt", "id", "text" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
