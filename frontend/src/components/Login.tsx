import React, { useState } from "react";
import { Lock, Mail, Sparkles, AlertCircle, Network, UserPlus, LogIn } from "lucide-react";

interface LoginProps {
  onLoginSuccess: (token: string, email: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Simple validation
    if (!email.trim() || !password) {
      setError("Please fill out all fields.");
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        // Register flow
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "Registration failed. Please try again.");
        }

        // Successfully registered! Let's auto login or tell user to log in
        setSuccessMsg("Account registered successfully! Logging you in...");
        
        // Log in automatically after registration
        await loginUser(email, password);
      } else {
        // Login flow
        await loginUser(email, password);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
      setIsLoading(false);
    }
  };

  const loginUser = async (userEmail: string, userPass: string) => {
    const formData = new URLSearchParams();
    formData.append("username", userEmail); // Form username contains email
    formData.append("password", userPass);

    const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "Incorrect email or password.");
    }

    const data = await response.json();
    setIsLoading(false);
    onLoginSuccess(data.access_token, userEmail);
  };

  return (
    <div className="auth-container">
      <div className="auth-card card">
        <div className="auth-header">
          <Network className="auth-logo" size={36} />
          <h2>Agentic Mindmap</h2>
          <p className="card-description">
            Sign in to access your custom visual mindmaps and collaborate with AI agents.
          </p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${!isSignUp ? "active" : ""}`}
            onClick={() => {
              setIsSignUp(false);
              setError(null);
              setSuccessMsg(null);
            }}
            disabled={isLoading}
          >
            <LogIn size={16} />
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${isSignUp ? "active" : ""}`}
            onClick={() => {
              setIsSignUp(true);
              setError(null);
              setSuccessMsg(null);
            }}
            disabled={isLoading}
          >
            <UserPlus size={16} />
            Register
          </button>
        </div>

        {error && (
          <div className="auth-message error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-message success">
            <Sparkles size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="topic-form">
          <div className="form-group">
            <label htmlFor="auth-email">Email Address</label>
            <div className="input-with-icon">
              <Mail className="input-icon" size={16} />
              <input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
                className="input-field"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Password</label>
            <div className="input-with-icon">
              <Lock className="input-icon" size={16} />
              <input
                id="auth-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                className="input-field"
              />
            </div>
          </div>

          {isSignUp && (
            <div className="form-group">
              <label htmlFor="auth-confirm-password">Confirm Password</label>
              <div className="input-with-icon">
                <Lock className="input-icon" size={16} />
                <input
                  id="auth-confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  required={isSignUp}
                  className="input-field"
                />
              </div>
            </div>
          )}

          <button type="submit" disabled={isLoading} className="btn btn-primary mt-2">
            {isLoading ? (
              <span className="spinner-container">
                <span className="spinner"></span>
                Processing...
              </span>
            ) : isSignUp ? (
              <>
                <UserPlus size={18} />
                Create Account
              </>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
