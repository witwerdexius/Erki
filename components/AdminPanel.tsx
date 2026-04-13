'use client';

import { useState, useEffect } from 'react';
import { X, Shield, User, Mail, Send } from 'lucide-react';
import { Profile, Community, UserRole } from '@/lib/types';
import { loadCommunityUsers, updateUserRole, sendInvite } from '@/lib/db';

interface Props {
  community: Community;
  currentUserId: string;
  onClose: () => void;
}

export default function AdminPanel({ community, currentUserId, onClose }: Props) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setSending] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadCommunityUsers(community.id)
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [community.id]);

  const handleRoleToggle = async (user: Profile) => {
    const newRole: UserRole = user.role === 'admin' ? 'user' : 'admin';
    setUpdatingId(user.id);
    try {
      await updateUserRole(user.id, newRole);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (e) {
      console.error(e);
      alert('Fehler beim Aktualisieren der Rolle.');
    }
    setUpdatingId(null);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSending(true);
    setInviteMsg('');
    try {
      await sendInvite(inviteEmail.trim());
      setInviteMsg(`Einladungslink an ${inviteEmail.trim()} gesendet.`);
      setInviteEmail('');
    } catch (e) {
      console.error(e);
      setInviteMsg('Fehler beim Senden der Einladung.');
    }
    setSending(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Verwaltung</h2>
            <p className="text-xs text-gray-500 mt-0.5">{community.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-gray-600 text-sm py-10">Wird geladen…</p>
          ) : users.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-10">Keine Benutzer gefunden.</p>
          ) : (
            <div>
              <p className="px-5 pt-4 pb-2 text-xs font-medium text-gray-600 uppercase tracking-wider">
                Benutzer ({users.length})
              </p>
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3 border-b last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#6bbfd4]/20 flex items-center justify-center shrink-0">
                    {u.role === 'admin'
                      ? <Shield className="w-4 h-4 text-[#6bbfd4]" />
                      : <User className="w-4 h-4 text-gray-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.displayName || u.email || u.id.slice(0, 8) + '…'}
                    </p>
                    {u.displayName && u.email && (
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.role === 'admin'
                        ? 'bg-[#6bbfd4]/15 text-[#6bbfd4]'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {u.role === 'admin' ? 'Admin' : 'Benutzer'}
                    </span>
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => handleRoleToggle(u)}
                        disabled={updatingId === u.id}
                        className="text-xs px-3 py-1 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 text-gray-600"
                      >
                        {updatingId === u.id ? '…' : u.role === 'admin' ? '→ Benutzer' : '→ Admin'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invite section */}
        <div className="px-5 py-4 border-t bg-gray-50">
          <p className="text-xs font-medium text-gray-500 mb-2">Einladen per E-Mail</p>
          <form onSubmit={handleInvite} className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <Mail className="w-4 h-4 text-gray-500 shrink-0" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@beispiel.de"
                className="bg-transparent border-none outline-none text-sm flex-1"
              />
            </div>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#6bbfd4] text-white text-sm rounded-xl hover:bg-[#5aaeC3] transition-all disabled:opacity-50 font-medium"
            >
              <Send className="w-3.5 h-3.5" />
              {inviting ? '…' : 'Senden'}
            </button>
          </form>
          {inviteMsg && (
            <p className={`text-xs mt-2 ${inviteMsg.startsWith('Fehler') ? 'text-red-500' : 'text-green-600'}`}>
              {inviteMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
