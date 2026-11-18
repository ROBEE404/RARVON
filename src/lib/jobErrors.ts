/**
 * Errors shared by Rarvon's jobs, kept in a tiny file with no heavy imports so
 * the engine can recognise them without loading the libraries that throw them.
 */

/** Audio job cancelled. */
export class CancelledError extends Error {
  constructor() {
    super('Cancelled.');
  }
}

/** Video job cancelled. */
export class VideoCancelledError extends Error {
  constructor() {
    super('Cancelled.');
  }
}

/** Video Editor export cancelled. */
export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled.');
  }
}

/** The PDF needs a password Rarvon doesn't have. */
export class PasswordRequired extends Error {}
