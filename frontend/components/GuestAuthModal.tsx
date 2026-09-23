"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Phone, ShieldCheck, Sparkles, User, X } from "lucide-react";

export interface NovaUser {
  name: string;
  phone: string;
  lastActive?: number;
}

interface GuestAuthModalProps {
  isOpen: boolean;
  currentUser?: NovaUser | null;
  onSuccess: (user: NovaUser) => void;
  onClose?: () => void;
}

export const CURRENT_USER_KEY = "nova_current_user";
export const SAVED_USERS_KEY = "nova_saved_users";

export default function GuestAuthModal({
  isOpen,
  currentUser,
  onSuccess,
  onClose,
}: GuestAuthModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [savedUsers, setSavedUsers] = useState<NovaUser[]>([]);
  const [selectedUserPhone, setSelectedUserPhone] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Load saved profiles from localStorage on mount or when modal opens
  useEffect(() => {
    if (!isOpen) return;

    try {
      const raw = localStorage.getItem(SAVED_USERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as NovaUser[];
        if (Array.isArray(parsed)) {
          setSavedUsers(parsed);
        }
      }
    } catch {
      // LocalStorage access failure
    }

    if (currentUser) {
      setName(currentUser.name || "");
      setPhone(currentUser.phone || "");
      setSelectedUserPhone(currentUser.phone || null);
    } else {
      setName("");
      setPhone("");
      setSelectedUserPhone(null);
    }
    setIsClosing(false);
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  // Clean phone digits for validation
  const cleanPhone = phone.replace(/\D/g, "");
  const isValid = name.trim().length > 0 && cleanPhone.length >= 10;

  const handleSelectChip = (user: NovaUser) => {
    setName(user.name);
    setPhone(user.phone);
    setSelectedUserPhone(user.phone);
  };

  const handleManualNameChange = (val: string) => {
    setName(val);
    setSelectedUserPhone(null);
  };

  const handleManualPhoneChange = (val: string) => {
    setPhone(val);
    setSelectedUserPhone(null);
  };

  const handleComplete = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isValid) return;

    const trimmedName = name.trim();
    const verifiedUser: NovaUser = {
      name: trimmedName,
      phone: cleanPhone,
      lastActive: Date.now(),
    };

    // 1. Save current active user
    try {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(verifiedUser));

      // 2. Save/update user in saved users list
      const existingRaw = localStorage.getItem(SAVED_USERS_KEY);
      let list: NovaUser[] = existingRaw ? JSON.parse(existingRaw) : [];
      if (!Array.isArray(list)) list = [];

      // Filter out existing profile with this phone number and put updated at top
      list = [verifiedUser, ...list.filter((u) => u.phone !== cleanPhone)].slice(0, 8);
      localStorage.setItem(SAVED_USERS_KEY, JSON.stringify(list));
    } catch {
      // Quota / private mode
    }

    // 3. Smooth closing animation then trigger callback
    setIsClosing(true);
    setTimeout(() => {
      onSuccess(verifiedUser);
      setIsClosing(false);
    }, 200);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only allow backdrop click to dismiss if user is already logged in
    if (e.target === e.currentTarget && currentUser && onClose) {
      setIsClosing(true);
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, 200);
    }
  };

  return (
    <div
      className={`guest-modal-backdrop ${isClosing ? "closing" : ""}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className="guest-modal-card">
        {currentUser && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              borderRadius: "6px",
            }}
          >
            <X size={18} />
          </button>
        )}

        {/* Nova AI Clear Brand Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
          <img
            src="/nova-wordmark-transparent.png"
            alt="NOVA AI"
            style={{
              height: "44px",
              width: "auto",
              filter: "drop-shadow(0 4px 20px rgba(99, 102, 241, 0.45))",
            }}
          />
        </div>

        <h2 className="guest-modal-title">Verify Guest Access</h2>
        <p className="guest-modal-subtitle">
          Enter your details to unlock a personalized and private AI experience.
        </p>

        {/* Smart Recognition: Quick-select chips for returning visitors */}
        {savedUsers.length > 0 && (
          <div className="guest-saved-section">
            <span className="guest-saved-label">Quick Select Saved Profile</span>
            <div className="guest-chips-container">
              {savedUsers.map((u) => {
                const isSelected = selectedUserPhone === u.phone;
                return (
                  <button
                    key={u.phone}
                    type="button"
                    className={`guest-chip ${isSelected ? "active" : ""}`}
                    onClick={() => handleSelectChip(u)}
                    title={`Select ${u.name} (${u.phone})`}
                  >
                    <span className="guest-chip-avatar">
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                    <span>{u.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Verification Form */}
        <form className="guest-form" onSubmit={handleComplete}>
          <div className="guest-field-group">
            <label htmlFor="guest-name-input" className="guest-field-label">
              Full Name
            </label>
            <div className="guest-input-wrap">
              <User className="guest-input-icon" />
              <input
                id="guest-name-input"
                type="text"
                autoFocus={!currentUser}
                required
                className="guest-input"
                placeholder="e.g. Preetam Kumar"
                value={name}
                onChange={(e) => handleManualNameChange(e.target.value)}
              />
            </div>
          </div>

          <div className="guest-field-group">
            <label htmlFor="guest-phone-input" className="guest-field-label">
              Phone Number (10+ digits)
            </label>
            <div className="guest-input-wrap">
              <Phone className="guest-input-icon" />
              <input
                id="guest-phone-input"
                type="tel"
                required
                className="guest-input"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => handleManualPhoneChange(e.target.value)}
              />
            </div>
          </div>

          {/* Submit Button ("Enter Nova AI") */}
          <button
            type="submit"
            disabled={!isValid}
            className="guest-submit-btn"
          >
            <span>Enter Nova AI</span>
            <ArrowRight size={17} />
          </button>
        </form>

        <div className="guest-footer-note">
          <ShieldCheck size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />
          Your chat history is securely encrypted and isolated to your phone number.
        </div>
      </div>
    </div>
  );
}
