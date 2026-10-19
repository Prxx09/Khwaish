"use client";
import { useEffect, useState } from "react";
import {
  Copy,
  Link2,
  LoaderCircle,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Library, type Member, type Profile } from "@/lib/types";
import { Avatar, ErrorText, Modal } from "./ui";
export default function SharingDialog({
  open,
  onClose,
  library,
  userId,
  isDemo,
  onCreate,
  onChanged,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  library: Library | undefined;
  userId: string;
  isDemo: boolean;
  onCreate: (name: string) => Promise<Library | undefined>;
  onChanged: () => void;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("editor");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<
    {
      id: string;
      role: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }[]
  >([]);
  const owner = library?.owner_id === userId;
  useEffect(() => {
    setLink("");
    setError("");
    setName("");
  }, [open, library?.id]);
  useEffect(() => {
    if (!open || !library) return;
    if (isDemo) {
      setMembers([
        {
          user_id: userId,
          library_id: library.id,
          role: "owner",
          joined_at: library.created_at,
          profile: { id: userId, display_name: "You", avatar_path: null },
        },
      ]);
      return;
    }
    let live = true;
    const client = createClient();
    async function load() {
      const { data, error } = await client
        .from("library_members")
        .select("*")
        .eq("library_id", library!.id)
        .order("joined_at");
      if (error) {
        if (live) setError(error.message);
        return;
      }
      const ids = (data ?? []).map((m) => m.user_id);
      const profiles = ids.length
        ? ((await client.from("profiles").select("*").in("id", ids)).data ?? [])
        : [];
      if (live)
        setMembers(
          (data ?? []).map((m) => ({
            ...m,
            profile: profiles.find((p: Profile) => p.id === m.user_id),
          })),
        );
      if (owner) {
        const { data } = await client
          .from("library_invites")
          .select("id,role,expires_at,accepted_at,revoked_at")
          .eq("library_id", library!.id)
          .order("created_at", { ascending: false });
        if (live) setInvites(data ?? []);
      }
    }
    load();
    return () => {
      live = false;
    };
  }, [library, open, userId, isDemo, owner]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim());
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create library.");
    } finally {
      setBusy(false);
    }
  }
  async function invite() {
    setBusy(true);
    setError("");
    try {
      if (isDemo) {
        setError(
          "Sign in to invite a friend. Demo changes stay in this browser.",
        );
        return;
      }
      const { data, error } = await createClient().rpc(
        "create_library_invite",
        { target_library: library!.id, member_role: role },
      );
      if (error) throw error;
      setLink(`${location.origin}/?invite=${encodeURIComponent(data)}`);
      notify("Invite created. It expires in 7 days and can be used once.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make invitation.");
    } finally {
      setBusy(false);
    }
  }
  async function changeMember(member: Member, newRole: string) {
    const client = createClient();
    const result =
      newRole === "remove"
        ? await client
            .from("library_members")
            .delete()
            .eq("library_id", library!.id)
            .eq("user_id", member.user_id)
        : await client
            .from("library_members")
            .update({ role: newRole })
            .eq("library_id", library!.id)
            .eq("user_id", member.user_id);
    if (result.error) setError(result.error.message);
    else {
      setMembers((m) =>
        newRole === "remove"
          ? m.filter((x) => x.user_id !== member.user_id)
          : m.map((x) =>
              x.user_id === member.user_id
                ? { ...x, role: newRole as Member["role"] }
                : x,
            ),
      );
      onChanged();
      notify("Access updated.");
    }
  }
  async function revoke(id: string) {
    const { error } = await createClient()
      .from("library_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) setError(error.message);
    else {
      setInvites((v) =>
        v.map((i) =>
          i.id === id ? { ...i, revoked_at: new Date().toISOString() } : i,
        ),
      );
      notify("Invitation revoked.");
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={library ? library.name : "Dream better, together."}
      subtitle={
        library
          ? "Your shared space, your rules."
          : "Create a shared shelf for a friend, a flat, or your next big plan."
      }
    >
      {!library ? (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <div className="shared-illustration">
            <UserPlus size={40} />
            <span>GOOD TASTE IS BETTER SHARED.</span>
          </div>
          <label>
            Give your space a name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The apartment edit, Our next trip…"
            />
          </label>
          <button className="btn primary full" disabled={busy || !name.trim()}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Plus size={17} />
            )}
            Create shared space
          </button>
        </form>
      ) : (
        <>
          {owner && (
            <div className="invite-box">
              <div>
                <h3>
                  <Link2 size={17} />
                  Invite a friend
                </h3>
                <p>One person per link. Expires in 7 days.</p>
              </div>
              <div className="form-row">
                <select
                  aria-label="Invitation access"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="editor">Can add & edit</option>
                  <option value="viewer">Can view & comment</option>
                </select>
                <button
                  className="btn primary"
                  onClick={invite}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <UserPlus size={16} />
                  )}
                  Create link
                </button>
              </div>
              {link && (
                <div className="copy-link">
                  <input
                    aria-label="Invitation link"
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    className="icon-btn"
                    aria-label="Copy invitation link"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        notify("Invite link copied. Send it to your friend.");
                      } catch {
                        notify("Select the link and copy it manually.");
                      }
                    }}
                  >
                    <Copy size={18} />
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="member-heading">
            <span className="eyebrow">THE PEOPLE IN THIS SPACE</span>
            <span>
              {members.length} {members.length === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="member-list">
            {members.map((m) => (
              <div className="member" key={m.user_id}>
                <Avatar name={m.profile?.display_name || "Member"} />
                <div>
                  <strong>
                    {m.profile?.display_name || "Member"}
                    {m.user_id === userId ? " (you)" : ""}
                  </strong>
                  <small>
                    {m.role === "owner"
                      ? "Space owner"
                      : m.role === "editor"
                        ? "Can add & edit"
                        : "Can view & comment"}
                  </small>
                </div>
                {owner && m.role !== "owner" ? (
                  <select
                    aria-label={`Access for ${m.profile?.display_name || "member"}`}
                    value={m.role}
                    onChange={(e) => changeMember(m, e.target.value)}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                    <option value="remove">Remove</option>
                  </select>
                ) : (
                  <span className="pill">{m.role}</span>
                )}
              </div>
            ))}
          </div>
          {owner && invites.some((i) => !i.revoked_at && !i.accepted_at) && (
            <div className="pending-invites">
              <span className="eyebrow">PENDING INVITES</span>
              {invites
                .filter((i) => !i.revoked_at && !i.accepted_at)
                .map((i) => (
                  <div key={i.id}>
                    <span>
                      {i.role} · expires{" "}
                      {new Date(i.expires_at).toLocaleDateString("en-IN")}
                    </span>
                    <button className="text-btn" onClick={() => revoke(i.id)}>
                      <X size={13} />
                      Revoke
                    </button>
                  </div>
                ))}
            </div>
          )}
          <p className="form-footnote">
            <ShieldCheck size={14} />
            Removing a member also removes their access to saved items and
            uploaded screenshots.
          </p>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
