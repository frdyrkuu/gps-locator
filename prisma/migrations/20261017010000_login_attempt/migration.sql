CREATE TABLE "LoginAttempt" (
    "key" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "LoginAttempt_windowStart_idx" ON "LoginAttempt"("windowStart");
