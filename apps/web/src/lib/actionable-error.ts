/**
 * Nielsen Usability Heuristic H9 helper:
 * "Help users recognize, diagnose, and recover from errors."
 *
 * Converts raw errors or system exceptions into clear, human-readable
 * descriptions paired with constructive, actionable recovery advice.
 */

export type ErrorContext =
  | "auth"
  | "upload"
  | "annotation"
  | "extraction"
  | "general";

export type ActionableError = {
  title: string;
  message: string;
  recoveryAdvice: string;
  retryable: boolean;
};

export function extractErrorMessage(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (raw instanceof Error) return raw.message.trim();
  if (typeof raw === "object" && "message" in raw && typeof raw.message === "string") {
    return raw.message.trim();
  }
  return String(raw);
}

export function formatActionableError(
  raw: unknown,
  context: ErrorContext = "general",
): ActionableError {
  const msg = extractErrorMessage(raw);
  const lower = msg.toLowerCase();

  // 1. Authentication context
  if (context === "auth" || lower.includes("auth") || lower.includes("login") || lower.includes("sign up")) {
    if (lower.includes("invalid login credentials") || lower.includes("invalid credentials")) {
      return {
        title: "Incorrect Email or Password",
        message: "The email address or password entered does not match our records.",
        recoveryAdvice: "Double-check for typos, or use the 1-click Demo Login below to test the app without signing up.",
        retryable: true,
      };
    }

    if (lower.includes("email not confirmed") || lower.includes("unconfirmed")) {
      return {
        title: "Email Not Confirmed",
        message: "Your account has been created, but your email address has not been confirmed yet.",
        recoveryAdvice: "Check your email inbox (and spam folder) for the verification link, or log in as a demo user.",
        retryable: false,
      };
    }

    if (lower.includes("already registered") || lower.includes("already taken") || lower.includes("user already exists")) {
      return {
        title: "Account Already Exists",
        message: "An account with this email or username is already registered.",
        recoveryAdvice: "Please sign in with your existing account, or choose a different username if registering.",
        retryable: true,
      };
    }

    if (lower.includes("rate limit") || lower.includes("too many requests") || lower.includes("over_email_send_rate_limit")) {
      return {
        title: "Too Many Attempts",
        message: "Authentication server rate limits have been temporarily exceeded.",
        recoveryAdvice: "Please wait a couple of minutes before retrying, or use Demo Login for instant evaluation access.",
        retryable: true,
      };
    }

    if (lower.includes("password") && (lower.includes("short") || lower.includes("characters") || lower.includes("weak"))) {
      return {
        title: "Password Too Short",
        message: "The chosen password does not meet minimum security requirements.",
        recoveryAdvice: "Enter a password with at least 8 characters.",
        retryable: true,
      };
    }
  }

  // 2. Audio Upload context
  if (context === "upload" || lower.includes("upload") || lower.includes("storage")) {
    if (lower.includes("limit") || lower.includes("50 mb") || lower.includes("too large") || lower.includes("size")) {
      return {
        title: "File Exceeds Size Limit",
        message: "The selected audio file is larger than the 50 MB upload limit.",
        recoveryAdvice: "Consider compressing your audio or trimming unneeded sections before uploading.",
        retryable: true,
      };
    }

    if (lower.includes("extension") || lower.includes("format") || lower.includes("mp3") || lower.includes("wav") || lower.includes("contents don't match")) {
      return {
        title: "Unsupported or Corrupted Audio File",
        message: msg || "Only authentic MP3 and WAV files are supported.",
        recoveryAdvice: "Ensure the file is a genuine MP3 or WAV audio track and was not renamed from another format.",
        retryable: true,
      };
    }

    if (lower.includes("too small")) {
      return {
        title: "Audio File Too Small",
        message: "The selected file is empty or missing audio header information.",
        recoveryAdvice: "Check that the file was exported properly and is not 0 bytes.",
        retryable: true,
      };
    }

    if (lower.includes("network") || lower.includes("connection") || lower.includes("offline") || lower.includes("fetch failed")) {
      return {
        title: "Upload Interrupted",
        message: "The file upload was interrupted by a network issue.",
        recoveryAdvice: "Check your internet connection and try uploading the file again.",
        retryable: true,
      };
    }
  }

  // 3. Annotation context
  if (context === "annotation" || lower.includes("annotation")) {
    if (lower.includes("conflict") || lower.includes("version") || lower.includes("modified by another user")) {
      return {
        title: "Collaborator Conflict Detected",
        message: "Another user saved changes to this annotation while you were editing.",
        recoveryAdvice: "Choose 'Keep My Draft' to preserve your edits with the latest version, or 'Discard' to reload server changes.",
        retryable: true,
      };
    }

    if (lower.includes("empty") || lower.includes("label and comment") || lower.includes("at least one")) {
      return {
        title: "Annotation Cannot Be Empty",
        message: "An annotation requires either a title label or a comment.",
        recoveryAdvice: "Add a short label (e.g., 'Vocal Harmony') or write a comment before saving.",
        retryable: true,
      };
    }

    if (lower.includes("earlier") || lower.includes("end time") || lower.includes("start time")) {
      return {
        title: "Invalid Timestamp Range",
        message: "The end timestamp cannot be earlier than the start timestamp.",
        recoveryAdvice: "Adjust the selection handles on the waveform so the end time is after the start time.",
        retryable: true,
      };
    }
  }

  // 4. Extraction context
  if (context === "extraction" || lower.includes("extract")) {
    if (lower.includes("range") || lower.includes("duration") || lower.includes("bound")) {
      return {
        title: "Invalid Extraction Range",
        message: msg || "The requested audio slice range is outside valid track boundaries.",
        recoveryAdvice: "Select a range between 0 seconds and the total duration of the track.",
        retryable: true,
      };
    }

    if (lower.includes("worker") || lower.includes("failed") || lower.includes("ffmpeg")) {
      return {
        title: "Extraction Processing Issue",
        message: msg || "Audio cutting worker encountered an issue processing this segment.",
        recoveryAdvice: "Try extracting a slightly different time window, or re-upload the source track.",
        retryable: true,
      };
    }

    if (lower.includes("download") || lower.includes("signed url")) {
      return {
        title: "Download Link Unavailable",
        message: "Could not generate a secure download link for this extracted segment.",
        recoveryAdvice: "Wait a few seconds for storage synchronization, then click download again.",
        retryable: true,
      };
    }
  }

  // 5. Generic network & timeout errors
  if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("timeout") || lower.includes("offline")) {
    return {
      title: "Connection Lost",
      message: "Unable to reach the server due to a network interruption.",
      recoveryAdvice: "Check your internet connection. We will automatically attempt to reconnect.",
      retryable: true,
    };
  }

  // Fallback for unclassified errors
  return {
    title: "Action Could Not Be Completed",
    message: msg || "An unexpected error occurred while processing your request.",
    recoveryAdvice: "Please try again. If the issue persists, refresh the page or check your connection.",
    retryable: true,
  };
}
