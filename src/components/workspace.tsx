"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FolderHeart,
  Grid2X2,
  Heart,
  LayoutGrid,
  Link2,
  List,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingDown,
  Users,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEMO_LIBRARIES, DEMO_USER, demoItems } from "@/lib/demo-data";
import { queryWishlist, type QueryResult } from "@/lib/query";
import {
  CATEGORIES,
  currentPrice,
  latestPrice,
  money,
  priceDrop,
  safeUrl,
  STATUS_LABELS,
  type Item,
  type Library,
  type Member,
  type Profile,
} from "@/lib/types";
import { Avatar, Brand, EmptyState, ErrorText, Modal, Skeletons } from "./ui";
import AuthDialog from "./auth-dialog";
import CaptureDialog, { type Draft } from "./capture-dialog";
import ProductCard from "./product-card";
import ItemDetail from "./item-detail";
import SharingDialog from "./sharing-dialog";

type View = "shelf" | "shared" | "watch" | "ask" | "settings";
const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
const NAV = [
  { id: "shelf", name: "My shelf", Icon: LayoutGrid },
  { id: "shared", name: "Shared spaces", Icon: Users },
  { id: "watch", name: "Price watch", Icon: TrendingDown },
  { id: "ask", name: "Ask Khwahish", Icon: Sparkles },
] as const;

export default function Workspace() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [dataOwner, setDataOwner] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [memberships, setMemberships] = useState<Member[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<View>("shelf");
  const [activeId, setActiveId] = useState("demo-personal");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const loadVersion = useRef(0);
  const [theme, setTheme] = useState("dark");
  const [sidebar, setSidebar] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLibrary, setShareLibrary] = useState<Library | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState("newest");
  const [layout, setLayout] = useState("grid");
  const [query, setQuery] = useState("");
  const [queryScope, setQueryScope] = useState("all");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryBusy, setQueryBusy] = useState(false);
  const queryVersion = useRef(0);
  const [pendingInvite, setPendingInvite] = useState("");
  const [joining, setJoining] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [statusInfo, setStatusInfo] = useState({
    comparison: false,
    scheduled: false,
    aiWishlist: false,
  });
  const [confirmLibraryDelete, setConfirmLibraryDelete] =
    useState<Library | null>(null);
  const isDemo = !user;
  const userId = user?.id ?? DEMO_USER;
  const displayName =
    profile?.display_name || user?.user_metadata?.name || "Dreamer";
  const activeLibrary =
    libraries.find((l) => l.id === activeId) ?? libraries[0];
  const activeRole = isDemo
    ? "owner"
    : memberships.find((m) => m.library_id === activeId && m.user_id === userId)
        ?.role;
  const canEdit = activeRole === "owner" || activeRole === "editor";
  const personal = libraries.find((l) => l.kind === "personal");
  const shared = libraries.filter((l) => l.kind === "shared");
  const selected = items.find((i) => i.id === selectedId);
  const selectedRole = isDemo
    ? "owner"
    : memberships.find(
        (m) => m.library_id === selected?.library_id && m.user_id === userId,
      )?.role;
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (shareOpen && isDemo) {
      setShareOpen(false);
      setAuthOpen(true);
      notify("Sign in to create a shared space with your people.");
    }
  }, [shareOpen, isDemo, notify]);
  useEffect(() => {
    if (
      !window.IntersectionObserver ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-enter");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    document
      .querySelectorAll(
        ".stats-grid, .shelf-section, .settings-card, .shared-card",
      )
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [view, loading]);

  const loadAccount = useCallback(async (id: string, background = false) => {
    const version = ++loadVersion.current;
    const client = createClient();
    if (!background) setLoading(true);
    setLoadError("");
    try {
      const { error: initError } = await client.rpc("ensure_personal_library");
      if (initError) throw initError;
      const [libResponse, memberResponse, profileResponse] = await Promise.all([
        client.from("libraries").select("*").order("created_at"),
        client.from("library_members").select("*").eq("user_id", id),
        client.from("profiles").select("*").eq("id", id).single(),
      ]);
      if (libResponse.error) throw libResponse.error;
      if (memberResponse.error) throw memberResponse.error;
      let all: Item[] = [];
      let page = 0;
      // Page through every accessible item rather than silently truncating wishlist search.
      while (true) {
        const { data, error } = await client
          .from("wishlist_items")
          .select(
            "*,price_observations(*),product_media!media_item_same_library(*)",
          )
          .order("created_at", { ascending: false })
          .range(page * 200, page * 200 + 199);
        if (error) throw error;
        all = all.concat(data as Item[]);
        if ((data?.length ?? 0) < 200) break;
        page++;
      }
      const paths = all
        .flatMap((i) => i.product_media ?? [])
        .map((m) => m.storage_path);
      const signed = paths.length
        ? ((
            await client.storage
              .from("wishlist-assets")
              .createSignedUrls(paths, 3600)
          ).data ?? [])
        : [];
      all = all.map((i) => ({
        ...i,
        price_observations: i.price_observations ?? [],
        product_media: (i.product_media ?? []).map((m) => ({
          ...m,
          signed_url:
            signed.find((s) => s.path === m.storage_path)?.signedUrl ??
            undefined,
        })),
      }));
      if (version !== loadVersion.current) return;
      setDataOwner(id);
      setItems(all);
      setLibraries(libResponse.data ?? []);
      setMemberships(memberResponse.data ?? []);
      setProfile(profileResponse.data);
      setProfileName(profileResponse.data?.display_name ?? "");
      setActiveId((old) =>
        (libResponse.data ?? []).some((l) => l.id === old)
          ? old
          : ((libResponse.data ?? []).find((l) => l.kind === "personal")?.id ??
            libResponse.data?.[0]?.id ??
            ""),
      );
    } catch (e) {
      if (version === loadVersion.current)
        setLoadError(
          e instanceof Error
            ? e.message
            : typeof e === "object" && e && "message" in e
              ? String(e.message)
              : "Your shelf could not load. Please try again.",
        );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme ?? "dark");
    const params = new URLSearchParams(location.search);
    const invitation = params.get("invite");
    if (invitation) {
      sessionStorage.setItem("khwahish:invite", invitation);
      history.replaceState({}, "", location.pathname);
    }
    setPendingInvite(
      invitation ?? sessionStorage.getItem("khwahish:invite") ?? "",
    );
    if (params.get("recovery") === "1") {
      setView("settings");
      notify("Choose a new password in your profile settings.");
    }
    if (params.get("auth") === "error")
      notify("That sign-in link could not be verified. Please sign in again.");
    if (!configured) {
      setAuthReady(true);
      return;
    }
    const client = createClient();
    let live = true;
    let authEventReceived = false;
    client.auth
      .getUser()
      .then(({ data }) => {
        if (live && !authEventReceived) {
          setUser(data.user);
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (live) setAuthReady(true);
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (live) {
        authEventReceived = true;
        setUser(session?.user ?? null);
        if (_event === "PASSWORD_RECOVERY") {
          setView("settings");
          notify("Choose a new password in your profile settings.");
        }
        if (_event === "SIGNED_OUT") {
          loadVersion.current++;
          setItems([]);
          setLibraries([]);
          setMemberships([]);
          setProfile(null);
          setDataOwner(null);
          setSelectedId(null);
          setShareOpen(false);
          setCaptureOpen(false);
        }
        setAuthReady(true);
      }
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, [notify]);
  useEffect(() => {
    if (!authReady) return;
    if (user) {
      setItems([]);
      setLibraries([]);
      setMemberships([]);
      loadAccount(user.id);
    } else {
      loadVersion.current++;
      setLoading(false);
      setLoadError("");
      setProfile(null);
      let demoLibraries: Library[] = DEMO_LIBRARIES.filter(
        (l) => l.kind === "personal",
      );
      try {
        const stored = JSON.parse(
          localStorage.getItem("khwahish:demo-libraries:v1") ?? "null",
        );
        if (
          Array.isArray(stored) &&
          stored.every(
            (l) =>
              typeof l.name === "string" &&
              typeof l.id === "string" &&
              l.id.startsWith("demo-"),
          )
        )
          demoLibraries = stored;
      } catch {}
      setLibraries(demoLibraries);
      setMemberships([]);
      setActiveId("demo-personal");
      let saved: Item[] = [];
      try {
        const raw = JSON.parse(
          localStorage.getItem("khwahish:demo:v1") ?? "null",
        );
        if (
          Array.isArray(raw) &&
          raw.every(
            (i) =>
              typeof i.product_name === "string" &&
              Array.isArray(i.price_observations) &&
              Array.isArray(i.product_media),
          )
        )
          saved = raw.filter(
            (i) => !demoItems().some((sample) => sample.id === i.id),
          );
      } catch {}
      setDataOwner(DEMO_USER);
      setItems(saved);
    }
  }, [user?.id, authReady, loadAccount]);
  useEffect(() => {
    if (authReady && isDemo && dataOwner === DEMO_USER && libraries.length)
      try {
        localStorage.setItem(
          "khwahish:demo-libraries:v1",
          JSON.stringify(libraries),
        );
        localStorage.setItem(
          "khwahish:demo:v1",
          JSON.stringify(
            items.map((i) => ({
              ...i,
              product_media: [],
              image_url: i.image_url?.startsWith("blob:") ? null : i.image_url,
            })),
          ),
        );
      } catch {}
  }, [items, libraries, isDemo, authReady, dataOwner]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!user || !activeId || activeId.startsWith("demo-")) return;
    const client = createClient();
    let timer: ReturnType<typeof setTimeout>;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => loadAccount(user.id, true), 250);
    };
    const channel = client
      .channel(`shelf-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wishlist_items",
          filter: `library_id=eq.${activeId}`,
        },
        reload,
      )
      .subscribe();
    const focus = () => loadAccount(user.id, true);
    window.addEventListener("focus", focus);
    const refresh = setInterval(focus, 45 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(refresh);
      window.removeEventListener("focus", focus);
      client.removeChannel(channel);
    };
  }, [user?.id, activeId, loadAccount]);
  useEffect(() => {
    if (user)
      fetch("/api/status")
        .then((r) => r.json())
        .then(setStatusInfo)
        .catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    setSearch("");
    setCategory("All");
    setStatus("all");
    setPriority("all");
    setQueryResult(null);
    queryVersion.current++;
    setQueryBusy(false);
  }, [activeId, view]);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("khwahish:theme", next);
    } catch {}
  }
  function go(next: View, libraryId?: string) {
    setView(next);
    setSidebar(false);
    if (libraryId) setActiveId(libraryId);
    else if (next === "shelf" && personal) setActiveId(personal.id);
  }
  const scopeItems =
    view === "watch"
      ? items.filter((i) => i.status !== "purchased" && i.status !== "not_now")
      : items.filter((i) => i.library_id === activeId);
  const visible = useMemo(() => {
    let result = scopeItems.filter(
      (i) =>
        (category === "All" || i.category === category) &&
        (status === "all" || i.status === status) &&
        (priority === "all" || i.priority === priority) &&
        (!search ||
          `${i.product_name} ${i.brand ?? ""} ${i.category ?? ""} ${i.notes}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
    if (sort === "price-low")
      result.sort(
        (a, b) =>
          a.currency.localeCompare(b.currency) ||
          (currentPrice(a) ?? Infinity) - (currentPrice(b) ?? Infinity),
      );
    else if (sort === "price-high")
      result.sort(
        (a, b) =>
          a.currency.localeCompare(b.currency) ||
          (currentPrice(b) ?? -1) - (currentPrice(a) ?? -1),
      );
    else if (sort === "drop")
      result.sort((a, b) => priceDrop(b) - priceDrop(a));
    else
      result.sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
      );
    return result;
  }, [scopeItems, category, status, priority, search, sort]);
  const watchDrops = items.filter(
    (i) => priceDrop(i) > 0 && i.status !== "purchased",
  );
  const value = scopeItems
    .filter((i) => i.currency.trim() === "INR")
    .reduce((n, i) => n + (currentPrice(i) ?? 0), 0);
  const savings = scopeItems
    .filter((i) => i.currency.trim() === "INR")
    .reduce((n, i) => n + priceDrop(i), 0);
  async function saveDraft(draft: Draft, file: File | null) {
    const fields = {
      library_id: draft.library_id,
      added_by: userId,
      product_name: draft.product_name.trim(),
      product_url: safeUrl(draft.product_url),
      canonical_url: safeUrl(draft.product_url),
      image_url: safeUrl(draft.image_url),
      brand: draft.brand || null,
      category: draft.category,
      retailer: draft.retailer || null,
      product_code: draft.product_code || null,
      variant: draft.variant || null,
      currency: draft.currency,
      initial_price: draft.price === "" ? null : Number(draft.price),
      initial_price_at: new Date().toISOString(),
      priority: draft.priority,
      notes: draft.notes,
      target_price:
        draft.target_price === "" ? null : Number(draft.target_price),
      target_date: draft.target_date || null,
      extraction_source: draft.source,
      extraction_confidence: draft.confidence,
    };
    if (!fields.product_name) throw new Error("Give your wish a name.");
    if (
      (fields.initial_price != null &&
        (!Number.isFinite(fields.initial_price) || fields.initial_price < 0)) ||
      (fields.target_price != null &&
        (!Number.isFinite(fields.target_price) || fields.target_price < 0))
    )
      throw new Error("Please enter a valid non-negative price.");
    if (isDemo) {
      const item = {
        ...fields,
        id: `demo-${crypto.randomUUID()}`,
        status: "want",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        price_observations: [],
        product_media: [],
      } as Item;
      setItems((items) => [item, ...items]);
      setActiveId(draft.library_id);
      setView("shelf");
      notify("Saved on this device. Sign in to save wishes to your account.");
      return true;
    }
    const client = createClient();
    const { data, error } = await client
      .from("wishlist_items")
      .insert(fields)
      .select()
      .single();
    if (error) throw new Error(error.message);
    let mediaWarning = "";
    if (file) {
      const extension =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
      const path = `${draft.library_id}/${data.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await client.storage
        .from("wishlist-assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error)
        mediaWarning =
          " Your wish was saved, but its screenshot could not upload.";
      else {
        const media = await client.from("product_media").insert({
          library_id: draft.library_id,
          wishlist_item_id: data.id,
          uploaded_by: userId,
          storage_path: path,
          mime_type: file.type,
          media_type: "screenshot",
          ocr_text: draft.raw_ocr_text ?? null,
        });
        if (media.error) {
          await client.storage.from("wishlist-assets").remove([path]);
          mediaWarning =
            " Your wish was saved, but the screenshot metadata could not be attached.";
        }
      }
    }
    if (fields.initial_price != null) {
      const observation = await client.from("price_observations").insert({
        wishlist_item_id: data.id,
        price: fields.initial_price,
        currency: fields.currency,
        availability: draft.availability,
        source: `saved_${draft.source}`,
        source_url: fields.product_url,
        created_by: userId,
      });
      if (observation.error)
        mediaWarning +=
          " The initial price is saved; its history entry could not be added.";
    }
    setActiveId(draft.library_id);
    setView("shelf");
    await loadAccount(user!.id, true);
    notify(`A new wish, safely shelved.${mediaWarning}`);
    return true;
  }
  async function updateItem(id: string, patch: Partial<Item>) {
    const old = items.find((i) => i.id === id);
    setItems((items) =>
      items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
    if (isDemo) {
      notify(patch.priority ? "Must-haves updated." : "Wish updated.");
      return true;
    }
    const allowed: Partial<Item> = {};
    for (const key of [
      "product_name",
      "product_url",
      "notes",
      "priority",
      "status",
      "target_price",
      "target_date",
      "variant",
      "tracking_enabled",
    ] as const)
      if (key in patch) Object.assign(allowed, { [key]: patch[key] });
    if (allowed.product_url && !safeUrl(allowed.product_url)) {
      if (old) setItems((items) => items.map((i) => (i.id === id ? old : i)));
      notify("Use a valid public product link.");
      return false;
    }
    const { error } = await createClient()
      .from("wishlist_items")
      .update(allowed)
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      if (old) setItems((items) => items.map((i) => (i.id === id ? old : i)));
      notify(error.message);
      return false;
    }
    return true;
  }
  async function deleteItem(item: Item) {
    if (!isDemo) {
      const client = createClient();
      const { error } = await client
        .from("wishlist_items")
        .delete()
        .eq("id", item.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const paths = item.product_media.map((m) => m.storage_path);
      if (paths.length) {
        const removed = await client.storage
          .from("wishlist-assets")
          .remove(paths);
        if (removed.error)
          notify(
            "Wish removed. Some screenshot files could not be cleaned up.",
          );
      }
    }
    setItems((all) => all.filter((i) => i.id !== item.id));
    notify("Wish removed from your shelf.");
  }
  async function refreshItem(item: Item) {
    const response = await fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setItems((items) =>
      items.map((i) =>
        i.id === item.id
          ? {
              ...i,
              price_observations: [...i.price_observations, data.observation],
            }
          : i,
      ),
    );
    notify(
      `Price checked: ${money(data.observation.price, data.observation.currency)}.`,
    );
  }
  async function createLibrary(name: string): Promise<Library | undefined> {
    let library: Library;
    if (isDemo) {
      library = {
        id: `demo-${crypto.randomUUID()}`,
        owner_id: userId,
        name,
        kind: "shared",
        created_at: new Date().toISOString(),
      };
      setLibraries((l) => [...l, library]);
    } else {
      const { data, error } = await createClient()
        .from("libraries")
        .insert({ name, kind: "shared", owner_id: userId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      library = data;
      await loadAccount(user!.id, true);
    }
    setShareLibrary(library);
    setActiveId(library.id);
    setView("shelf");
    notify("Shared space created.");
    return library;
  }
  async function join() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setJoining(true);
    try {
      const { data, error } = await createClient().rpc(
        "accept_library_invite",
        { invite_token: pendingInvite },
      );
      if (error) throw error;
      setPendingInvite("");
      sessionStorage.removeItem("khwahish:invite");
      setActiveId(data);
      setView("shelf");
      await loadAccount(user.id);
      notify("You’re in. Welcome to your shared space.");
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String(e.message)
            : "Could not join this space.",
      );
    } finally {
      setJoining(false);
    }
  }
  async function signOut() {
    if (configured) {
      try {
        const { error } = await createClient().auth.signOut();
        if (error) throw error;
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Sign-out failed. Please try again.",
        );
        return;
      }
    }
    setUser(null);
    setSelectedId(null);
    setView("shelf");
    notify("Signed out. Your personal wishes are safely saved.");
  }
  async function saveProfile() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setSettingsBusy(true);
    try {
      const client = createClient();
      const { error } = await client
        .from("profiles")
        .update({ display_name: profileName.trim() })
        .eq("id", user.id);
      if (error) throw error;
      if (newPassword) {
        const { error } = await client.auth.updateUser({
          password: newPassword,
        });
        if (error) throw error;
        setNewPassword("");
      }
      setProfile((p) => (p ? { ...p, display_name: profileName.trim() } : p));
      notify("Your profile is updated.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Profile could not be updated.");
    } finally {
      setSettingsBusy(false);
    }
  }
  async function runQuery(text = query) {
    if (!text.trim()) return;
    const version = ++queryVersion.current;
    setQuery(text);
    const scoped =
      queryScope === "all"
        ? items
        : items.filter((item) => item.library_id === queryScope);
    if (isDemo || !statusInfo.aiWishlist) {
      setQueryResult(queryWishlist(text, scoped, userId));
      return;
    }
    setQueryBusy(true);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, libraryId: queryScope }),
        signal: AbortSignal.timeout(35000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (version !== queryVersion.current) return;
      setQueryResult({
        ...body,
        items: body.ids.flatMap((id: string) => {
          const item = scoped.find((item) => item.id === id);
          return item ? [item] : [];
        }),
      });
    } catch (error) {
      if (version === queryVersion.current) {
        setQueryResult(queryWishlist(text, scoped, userId));
        notify(
          error instanceof Error
            ? error.message
            : "AI search unavailable. Showing local matches.",
        );
      }
    } finally {
      if (version === queryVersion.current) setQueryBusy(false);
    }
  }
  function exportCsv() {
    const safe = (v: unknown) => {
      let value = String(v ?? "");
      if (/^[=+@\-]/.test(value)) value = `'${value}`;
      return `"${value.replaceAll('"', '""')}"`;
    };
    const rows = [
      [
        "Product",
        "Link",
        "Category",
        "Store",
        "Initial price",
        "Latest price",
        "Currency",
        "Priority",
        "Status",
        "Target date",
        "Notes",
      ],
      ...scopeItems.map((i) => [
        i.product_name,
        i.product_url,
        i.category,
        i.retailer,
        i.initial_price,
        currentPrice(i),
        i.currency,
        i.priority,
        i.status,
        i.target_date,
        i.notes,
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(safe).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "Khwahish-wishlist.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function deleteLibrary(lib: Library) {
    if (isDemo) {
      setLibraries((l) => l.filter((x) => x.id !== lib.id));
      setItems((i) => i.filter((x) => x.library_id !== lib.id));
    } else {
      const paths = items
        .filter((i) => i.library_id === lib.id)
        .flatMap((i) => i.product_media.map((m) => m.storage_path));
      if (paths.length) {
        const { error: mediaError } = await createClient()
          .storage.from("wishlist-assets")
          .remove(paths);
        if (mediaError) {
          notify(
            "Could not remove all screenshots. The library has been kept; please try again.",
          );
          return;
        }
      }
      const { error } = await createClient()
        .from("libraries")
        .delete()
        .eq("id", lib.id)
        .select("id")
        .single();
      if (error) {
        notify(error.message);
        return;
      }
      await loadAccount(user!.id, true);
    }
    setConfirmLibraryDelete(null);
    setActiveId(personal?.id ?? "");
    notify("Shared space removed.");
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-btn mobile-only"
            aria-label="Close navigation"
            onClick={() => setSidebar(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="online-dot" />
          {isDemo ? "YOUR GUEST SHELF" : "YOUR LITTLE UNIVERSE"}
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.map(({ id, name, Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{name}</span>
              {id === "shelf" && (
                <span className="nav-count">
                  {items.filter((i) => i.library_id === personal?.id).length}
                </span>
              )}
              {id === "watch" && watchDrops.length > 0 && (
                <span className="nav-alert" />
              )}
              {id === "ask" && <span className="mini-tag">SMART</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-section">
          <div>
            <span>YOUR SPACES</span>
            <button
              className="mini-icon"
              aria-label="Create a shared space"
              onClick={() => {
                setShareLibrary(undefined);
                setShareOpen(true);
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          {shared.map((lib, i) => (
            <button
              key={lib.id}
              className={`space-link ${activeId === lib.id && view === "shelf" ? "active" : ""}`}
              onClick={() => go("shelf", lib.id)}
            >
              <span className={`space-icon color-${i % 3}`}>
                <Users size={14} />
              </span>
              <span>{lib.name}</span>
              <ChevronRight size={14} />
            </button>
          ))}
          {shared.length === 0 && (
            <button
              className="space-link muted"
              onClick={() => {
                setShareLibrary(undefined);
                setShareOpen(true);
              }}
            >
              <Plus size={15} />
              Start a shared wishlist
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <span className="tiny-stars">✦ ✧</span>
            <h3>
              Good taste.
              <br />
              Great company.
            </h3>
            <p>
              Your wishlist is better
              <br />
              with your people.
            </p>
            <button
              onClick={() => {
                setShareLibrary(undefined);
                setShareOpen(true);
              }}
            >
              Start a shared space <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`settings-link ${view === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings2 size={18} />
            Settings & profile
          </button>
          <div className="account">
            <button
              className="account-avatar"
              aria-label={
                isDemo ? "Sign in to your account" : "Edit your profile"
              }
              onClick={() => (isDemo ? setAuthOpen(true) : go("settings"))}
            >
              <Avatar name={isDemo ? "You" : displayName} />
            </button>
            <div>
              <strong>{isDemo ? "Your space awaits" : displayName}</strong>
              <span>{isDemo ? "Sign in to save & share" : user?.email}</span>
            </div>
            <button
              className="icon-btn"
              onClick={() => (isDemo ? setAuthOpen(true) : signOut())}
              aria-label={isDemo ? "Sign in" : "Sign out"}
            >
              {isDemo ? <LogIn size={17} /> : <LogOut size={17} />}
            </button>
          </div>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-only"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Your space <ChevronRight size={13} />
              <strong>
                {view === "shelf"
                  ? (activeLibrary?.name ?? "My wishlist")
                  : (NAV.find((n) => n.id === view)?.name ?? "Settings")}
              </strong>
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              <Sun size={15} className={theme === "light" ? "selected" : ""} />
              <Moon size={15} className={theme === "dark" ? "selected" : ""} />
            </button>
            <button
              className="icon-btn notification-btn"
              onClick={() => go("watch")}
              aria-label="View price drops"
            >
              <Bell size={19} />
              {watchDrops.length > 0 && <i />}
            </button>
            {isDemo ? (
              <button
                className="btn primary small-btn"
                onClick={() => setAuthOpen(true)}
              >
                Make it mine
                <ArrowUpRight size={15} />
              </button>
            ) : (
              <button
                className="profile-button"
                onClick={() => go("settings")}
                aria-label="Open profile"
              >
                <Avatar name={displayName} size="small" />
              </button>
            )}
          </div>
        </header>
        <main id="main-content" className="main-content">
          <section className="workspace-command">
            <div>
              <span className="eyebrow">YOUR WISHLIST WORKSPACE</span>
              <h2>
                {isDemo
                  ? "A space for your next obsession."
                  : `Hey ${displayName.split(" ")[0]}, what caught your eye?`}
              </h2>
              <p>
                {items.length} wishes · {shared.length} shared spaces · curated
                by you
              </p>
            </div>
            <div className="workspace-shortcuts">
              <button className="btn secondary" onClick={() => go("ask")}>
                <Sparkles size={17} />
                Ask my shelf
              </button>
              <button
                className="btn primary"
                disabled={!canEdit}
                onClick={() => setCaptureOpen(true)}
              >
                <Plus size={18} />
                Save a find
              </button>
            </div>
          </section>
          {isDemo && authReady && (
            <div className="demo-banner">
              <span>
                <span className="live-dot" />
                Guest shelf · saved on this device. Sign in for private cloud
                storage and sharing.
              </span>
              <button onClick={() => setAuthOpen(true)}>
                Create your own shelf <ArrowRight size={14} />
              </button>
            </div>
          )}
          {pendingInvite && (
            <div className="invite-banner">
              <Users size={22} />
              <div>
                <strong>A shared space is waiting for you.</strong>
                <p>
                  {user
                    ? "Join your friend’s library and start wishing together."
                    : "Sign in or create an account to join your friend’s library."}
                </p>
              </div>
              <button className="btn primary" disabled={joining} onClick={join}>
                {joining
                  ? "Joining…"
                  : user
                    ? "Join shared space"
                    : "Sign in to join"}
                <ArrowRight size={16} />
              </button>
              <button
                className="icon-btn"
                aria-label="Dismiss invitation"
                onClick={() => {
                  setPendingInvite("");
                  sessionStorage.removeItem("khwahish:invite");
                }}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {loadError && (
            <div className="notice error-notice" role="alert">
              {loadError}
              <button
                className="text-btn"
                onClick={() => user && loadAccount(user.id)}
              >
                Try again
              </button>
            </div>
          )}
          {(view === "shelf" || view === "watch") && (
            <>
              {view === "shelf" ? (
                <section className="hero">
                  <div className="hero-copy">
                    <span className="eyebrow">
                      <span /> SAVE IT. DREAM IT. MAYBE BUY IT.
                    </span>
                    <h1>
                      Big dreams.
                      <br />
                      Little <em>wishlist.</em>
                      <span className="hero-star">✳</span>
                    </h1>
                    <p>
                      A little space for everything that makes you go
                      <br className="desktop-break" /> “okay, I need that.”
                    </p>
                    <button
                      className="btn hero-btn"
                      onClick={() => setCaptureOpen(true)}
                      disabled={!canEdit}
                    >
                      <Plus size={18} />
                      Add a little wish
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <span className="orbit orbit-1" />
                    <span className="orbit orbit-2" />
                    <div className="float-note note-top">
                      <span>✦</span> Your next favourite
                    </div>
                    <div className="hero-card card-back">
                      <Heart size={37} fill="currentColor" />
                      <span>for the plot.</span>
                    </div>
                    <div className="hero-card card-front">
                      <span className="hero-card-mini">THE WANT LIST</span>
                      <span className="hero-spark">✳</span>
                      <strong>
                        good
                        <br />
                        things
                        <br />
                        <em>ahead.</em>
                      </strong>
                      <div>
                        <span>CURATED BY YOU</span>
                        <ArrowUpRight size={16} />
                      </div>
                    </div>
                    <div className="float-note note-bottom">
                      <span className="note-circle">
                        <Check size={12} />
                      </span>{" "}
                      Saved for someday. Or today.
                    </div>
                    <span className="hero-dot dot-1" />
                    <span className="hero-dot dot-2" />
                    <span className="hero-doodle">↗</span>
                  </div>
                </section>
              ) : (
                <section className="page-heading watch-heading">
                  <span className="eyebrow">
                    <span className="live-dot" /> KEEP AN EYE ON THE GOOD STUFF
                  </span>
                  <h1>
                    Same wish.
                    <br />
                    <em>Better price.</em>
                  </h1>
                  <p>
                    Your saved prices, price drops, and happy-price goals—in one
                    place.
                  </p>
                </section>
              )}
              <section className="stats-grid" aria-label="Wishlist overview">
                <div className="stat">
                  <span className="stat-icon lavender">
                    <Heart size={19} />
                  </span>
                  <div>
                    <span>Wishes on this shelf</span>
                    <strong>
                      {scopeItems.length}
                      <small>little possibilities</small>
                    </strong>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon mint">
                    <TrendingDown size={19} />
                  </span>
                  <div>
                    <span>Recorded price drops</span>
                    <strong>
                      {money(savings)}
                      <small>
                        {scopeItems.filter((i) => priceDrop(i) > 0).length}{" "}
                        finds got cheaper
                      </small>
                    </strong>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon peach">
                    <Zap size={19} />
                  </span>
                  <div>
                    <span>Shelf value · INR</span>
                    <strong>
                      {money(value)}
                      <small>based on saved prices</small>
                    </strong>
                  </div>
                </div>
              </section>
              <section className="shelf-section">
                <div className="section-heading">
                  <div>
                    <div className="title-with-icon">
                      <h2>
                        {view === "watch"
                          ? "Your price watch"
                          : activeLibrary?.kind === "shared"
                            ? activeLibrary.name
                            : "The want list"}
                      </h2>
                      <span className="count-badge">{scopeItems.length}</span>
                      {activeLibrary?.kind === "shared" && (
                        <span className="shared-label">
                          <Users size={13} />
                          Shared
                        </span>
                      )}
                    </div>
                    <p>
                      {view === "watch"
                        ? "Price checks run when you ask. Store access and data availability may vary."
                        : activeLibrary?.kind === "shared"
                          ? "Good finds, shared with your people."
                          : "A collection of things you’re a little obsessed with."}
                    </p>
                  </div>
                  <div className="section-actions">
                    {activeLibrary?.kind === "shared" && view === "shelf" && (
                      <button
                        className="btn secondary"
                        onClick={() => {
                          setShareLibrary(activeLibrary);
                          setShareOpen(true);
                        }}
                      >
                        <Users size={16} />
                        People
                      </button>
                    )}
                    <button
                      className="icon-btn export-btn"
                      onClick={exportCsv}
                      aria-label="Export wishlist as CSV"
                    >
                      <Download size={17} />
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => setCaptureOpen(true)}
                      disabled={!canEdit}
                    >
                      <Plus size={17} />
                      Add a wish
                    </button>
                  </div>
                </div>
                <div className="filter-bar">
                  <div className="search-input">
                    <Search size={17} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Find something on your shelf…"
                      aria-label="Search wishlist"
                    />
                    {search && (
                      <button
                        className="mini-icon"
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <select
                    aria-label="Filter status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="all">All priorities</option>
                    <option value="high">Must-haves</option>
                    <option value="medium">Would love</option>
                    <option value="low">Someday</option>
                  </select>
                  <select
                    aria-label="Sort wishlist"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="newest">Recently added</option>
                    <option value="price-low">
                      Price: low to high by currency
                    </option>
                    <option value="price-high">
                      Price: high to low by currency
                    </option>
                    <option value="drop">Biggest price drops</option>
                  </select>
                  <div className="view-toggle">
                    <button
                      aria-label="Grid view"
                      aria-pressed={layout === "grid"}
                      className={layout === "grid" ? "active" : ""}
                      onClick={() => setLayout("grid")}
                    >
                      <Grid2X2 size={17} />
                    </button>
                    <button
                      aria-label="List view"
                      aria-pressed={layout === "list"}
                      className={layout === "list" ? "active" : ""}
                      onClick={() => setLayout("list")}
                    >
                      <List size={17} />
                    </button>
                  </div>
                </div>
                <div className="category-tabs">
                  <button
                    className={category === "All" ? "active" : ""}
                    onClick={() => setCategory("All")}
                  >
                    All wishes<span>{scopeItems.length}</span>
                  </button>
                  {CATEGORIES.filter((c) =>
                    scopeItems.some((i) => i.category === c),
                  ).map((c) => (
                    <button
                      key={c}
                      className={category === c ? "active" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {loading || !authReady ? (
                  <Skeletons />
                ) : visible.length ? (
                  <div
                    className={`product-grid ${layout === "list" ? "list-view" : ""}`}
                  >
                    {visible.map((item, index) => (
                      <ProductCard
                        item={item}
                        index={index}
                        key={item.id}
                        onSelect={() => setSelectedId(item.id)}
                        canEdit={
                          isDemo ||
                          memberships.some(
                            (m) =>
                              m.library_id === item.library_id &&
                              m.role !== "viewer",
                          )
                        }
                        onFavorite={() =>
                          updateItem(item.id, {
                            priority:
                              item.priority === "high" ? "medium" : "high",
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={
                      search || category !== "All"
                        ? "No wishes found. Yet."
                        : "Your next favourite belongs here."
                    }
                    body={
                      search || category !== "All"
                        ? "Try a different search or clear your filters."
                        : "Save a product link, upload a screenshot, or add a wish of your own."
                    }
                    action={
                      <button
                        className="btn primary"
                        disabled={!canEdit}
                        onClick={() => setCaptureOpen(true)}
                      >
                        <Plus size={17} />
                        Add your first wish
                      </button>
                    }
                  />
                )}
              </section>
              <section className="ask-strip">
                <span className="ask-strip-icon">
                  <Sparkles size={23} />
                </span>
                <div>
                  <h3>Your shelf has answers.</h3>
                  <p>“Show my must-haves under ₹5,000”</p>
                </div>
                <button
                  className="text-btn"
                  onClick={() => {
                    setView("ask");
                    setQuery("Show my must-haves under ₹5,000");
                  }}
                >
                  Ask Khwahish
                  <ArrowRight size={18} />
                </button>
              </section>
            </>
          )}
          {view === "shared" && (
            <>
              <section className="page-heading">
                <span className="eyebrow">
                  YOUR PEOPLE. YOUR POSSIBILITIES.
                </span>
                <h1>
                  Better <em>together.</em>
                  <span className="heading-star">✦</span>
                </h1>
                <p>
                  For your next apartment, birthday ideas, or the things you
                  both keep sending each other.
                </p>
                <button
                  className="btn primary"
                  onClick={() => {
                    setShareLibrary(undefined);
                    setShareOpen(true);
                  }}
                >
                  <Plus size={17} />
                  Create a shared space
                </button>
              </section>
              <div className="spaces-grid">
                {shared.map((lib, index) => (
                  <article
                    className={`space-card space-tone-${index % 3}`}
                    key={lib.id}
                  >
                    <div className="space-card-top">
                      <span className="space-card-icon">
                        <FolderHeart size={30} />
                      </span>
                      <span className="pill">
                        {lib.owner_id === userId
                          ? "Your space"
                          : "Joined space"}
                      </span>
                    </div>
                    <h2>{lib.name}</h2>
                    <p>
                      {items.filter((i) => i.library_id === lib.id).length}{" "}
                      wishes · a world of possibilities
                    </p>
                    <div className="space-card-bottom">
                      <button onClick={() => go("shelf", lib.id)}>
                        Step inside
                        <ArrowRight size={17} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Manage ${lib.name}`}
                        onClick={() => {
                          setShareLibrary(lib);
                          setShareOpen(true);
                        }}
                      >
                        <Users size={19} />
                      </button>
                    </div>
                    {lib.owner_id === userId && (
                      <button
                        className="space-delete"
                        onClick={() => setConfirmLibraryDelete(lib)}
                      >
                        Remove space
                      </button>
                    )}
                  </article>
                ))}
                <button
                  className="new-space-card"
                  onClick={() => {
                    setShareLibrary(undefined);
                    setShareOpen(true);
                  }}
                >
                  <span>
                    <Plus size={30} />
                  </span>
                  <h3>Make room for more.</h3>
                  <p>
                    A new shared space,
                    <br />a new little adventure.
                  </p>
                </button>
              </div>
              <div className="privacy-note">
                <ShieldCheck size={20} />
                <div>
                  <strong>Sharing is always your choice.</strong>
                  <p>
                    Your personal shelf stays private. Shared-space editors can
                    add and edit; viewers can browse and comment. Invitations
                    expire after 7 days.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "ask" && (
            <>
              <section className="page-heading ask-heading">
                <span className="ask-hero-icon">
                  <Sparkles size={30} />
                </span>
                <span className="eyebrow">
                  A LITTLE CLARITY FOR YOUR COLLECTION
                </span>
                <h1>
                  Ask your <em>wishlist.</em>
                </h1>
                <p>
                  Less scrolling. More “that’s the one.” Find wishes, check
                  budgets, and spot price drops using everyday language.
                </p>
              </section>
              <div className="query-panel">
                <div className="query-scope">
                  <button
                    type="button"
                    className="text-btn"
                    disabled={!queryResult && !query}
                    onClick={() => {
                      queryVersion.current++;
                      setQueryBusy(false);
                      setQuery("");
                      setQueryResult(null);
                      notify("Conversation cleared.");
                    }}
                  >
                    Clear chat
                  </button>
                  <span>Look in</span>
                  <select
                    aria-label="Query library"
                    value={queryScope}
                    onChange={(e) => {
                      setQueryScope(e.target.value);
                      queryVersion.current++;
                      setQueryBusy(false);
                      setQueryResult(null);
                    }}
                  >
                    <option value="all">All my libraries</option>
                    {libraries.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <span className="private-badge">
                    <ShieldCheck size={12} />
                    {statusInfo.aiWishlist && !isDemo
                      ? "AI uses accessible wishlist details"
                      : "Local wishlist search"}
                  </span>
                </div>
                <form
                  className="query-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    runQuery();
                  }}
                >
                  <Sparkles size={22} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={500}
                    aria-label="Ask your wishlist"
                    placeholder="Show me electronics under ₹10,000…"
                  />
                  <button
                    className="icon-btn accent"
                    disabled={!query.trim() || queryBusy}
                    aria-label="Ask question"
                  >
                    {queryBusy ? (
                      <LoaderCircle size={21} className="spin" />
                    ) : (
                      <ArrowRight size={21} />
                    )}
                  </button>
                </form>
                <div className="query-prompts">
                  {[
                    "What got cheaper?",
                    "Show high priority items",
                    "What is the total cost?",
                    "Show electronics under ₹5,000",
                  ].map((p) => (
                    <button onClick={() => runQuery(p)} key={p}>
                      {p}
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
              {queryResult ? (
                <section className="query-results">
                  <div className="query-answer">
                    <span className="answer-icon">
                      <Sparkles size={19} />
                    </span>
                    <div>
                      <h3>{queryResult.answer}</h3>
                      <div className="answer-filters">
                        {queryResult.filters.map((f) => (
                          <span className="pill" key={f}>
                            {f}
                          </span>
                        ))}
                      </div>
                      <p>
                        Based on saved items and recorded prices. Use “Check
                        price” on an item for a fresh store check.
                      </p>
                    </div>
                  </div>
                  <div className="product-grid">
                    {queryResult.items.map((i, n) => (
                      <ProductCard
                        key={i.id}
                        item={i}
                        index={n}
                        onSelect={() => setSelectedId(i.id)}
                        canEdit={false}
                        onFavorite={() => {}}
                      />
                    ))}
                  </div>
                </section>
              ) : (
                <div className="query-explainer">
                  <div>
                    <Search size={21} />
                    <strong>Find your thing</strong>
                    <p>
                      Search a product, category, store, priority, or budget.
                    </p>
                  </div>
                  <div>
                    <TrendingDown size={21} />
                    <strong>Spot a little win</strong>
                    <p>Find products with a recorded price drop.</p>
                  </div>
                  <div>
                    <ShieldCheck size={21} />
                    <strong>Keep it personal</strong>
                    <p>
                      AI search sends details from your selected accessible
                      libraries to Groq. Guest and fallback search run locally.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <section className="page-heading">
                <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                <h1>
                  Very <em>you.</em>
                </h1>
                <p>
                  Your profile, your preferences, your little wishlist universe.
                </p>
              </section>
              <div className="settings-grid">
                <section className="settings-card">
                  <h3>
                    <Settings2 size={19} />
                    Your profile
                  </h3>
                  {isDemo ? (
                    <EmptyState
                      title="A shelf with your name on it."
                      body="Sign in to save your wishes across devices and share with your people."
                      action={
                        <button
                          className="btn primary"
                          onClick={() => setAuthOpen(true)}
                        >
                          Create my account
                          <ArrowRight size={16} />
                        </button>
                      }
                    />
                  ) : (
                    <form
                      className="form-stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveProfile();
                      }}
                    >
                      <label>
                        Display name
                        <input
                          required
                          maxLength={80}
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                        />
                      </label>
                      <label>
                        Email
                        <input value={user?.email ?? ""} disabled />
                      </label>
                      <label>
                        New password <span className="muted">(optional)</span>
                        <input
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 8 characters"
                        />
                      </label>
                      <button className="btn primary" disabled={settingsBusy}>
                        {settingsBusy ? "Saving…" : "Save my profile"}
                        <Check size={16} />
                      </button>
                    </form>
                  )}
                </section>
                <section className="settings-card">
                  <h3>
                    <Sun size={19} />
                    Set the mood
                  </h3>
                  <p className="muted">A little light. A little after-hours.</p>
                  <div className="theme-options">
                    <button
                      className={theme === "light" ? "selected" : ""}
                      onClick={() => {
                        if (theme !== "light") toggleTheme();
                      }}
                    >
                      <span className="theme-preview light-preview">
                        <i />
                        <i />
                        <i />
                      </span>
                      <Sun size={17} />
                      Daydream{theme === "light" && <Check size={15} />}
                    </button>
                    <button
                      className={theme === "dark" ? "selected" : ""}
                      onClick={() => {
                        if (theme !== "dark") toggleTheme();
                      }}
                    >
                      <span className="theme-preview dark-preview">
                        <i />
                        <i />
                        <i />
                      </span>
                      <Moon size={17} />
                      After hours{theme === "dark" && <Check size={15} />}
                    </button>
                  </div>
                  <p className="form-footnote">
                    Animations automatically tone down when your device asks for
                    reduced motion.
                  </p>
                </section>
                <section className="settings-card">
                  <h3>
                    <ShieldCheck size={19} />
                    Your data, your space
                  </h3>
                  <ul className="privacy-list">
                    <li>
                      <Check size={16} />
                      Personal libraries are private by default.
                    </li>
                    <li>
                      <Check size={16} />
                      Shared access is checked by the database.
                    </li>
                    <li>
                      <Check size={16} />
                      Screenshot OCR runs on your device.
                    </li>
                    <li>
                      <Check size={16} />
                      AI search uses only libraries you can access; selected
                      product details are sent to Groq.
                    </li>
                  </ul>
                  <button className="btn secondary" onClick={exportCsv}>
                    <Download size={16} />
                    Export current shelf
                  </button>
                </section>
                <section className="settings-card">
                  <h3>
                    <Zap size={19} />
                    Connected possibilities
                  </h3>
                  <div className="connection-row">
                    <span>Personal & shared storage</span>
                    <span className="pill">
                      {isDemo ? "This device only" : "Connected"}
                    </span>
                  </div>
                  <div className="connection-row">
                    <span>Product-page previews</span>
                    <span className="pill">
                      {isDemo ? "Sign in" : "On demand"}
                    </span>
                  </div>
                  <div className="connection-row">
                    <span>Shopping comparison provider</span>
                    <span className="pill">
                      {statusInfo.comparison ? "Connected" : "Store searches"}
                    </span>
                  </div>
                  <div className="connection-row">
                    <span>Scheduled price checks</span>
                    <span className="pill">
                      {statusInfo.scheduled ? "Configured" : "On-demand only"}
                    </span>
                  </div>
                  <p className="form-footnote">
                    Some retailers block automated previews. A manual entry or
                    screenshot always keeps your wish usable.
                  </p>
                  {isDemo ? (
                    <button
                      className="text-btn"
                      onClick={() => {
                        localStorage.removeItem("khwahish:demo:v1");
                        setItems([]);
                        setLibraries(
                          DEMO_LIBRARIES.filter((l) => l.kind === "personal"),
                        );
                        setActiveId("demo-personal");
                        notify("Guest shelf cleared on this device.");
                      }}
                    >
                      Clear guest shelf
                    </button>
                  ) : (
                    <button className="text-btn" onClick={signOut}>
                      <LogOut size={16} />
                      Sign out
                    </button>
                  )}
                </section>
              </div>
            </>
          )}
          <footer className="app-footer">
            <Brand small />
            <span>For all your “one day” things.</span>
            <span>WISH IT. SHELF IT. ✦</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV.map(({ id, name, Icon }) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => go(id)}
          >
            <Icon size={20} />
            <span>
              {name === "Ask Khwahish"
                ? "Ask"
                : name === "Shared spaces"
                  ? "Shared"
                  : name}
            </span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {toast}
          <button
            className="mini-icon"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      <CaptureDialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        libraries={libraries.filter(
          (l) =>
            isDemo ||
            memberships.some(
              (m) => m.library_id === l.id && m.role !== "viewer",
            ),
        )}
        libraryId={
          (
            libraries
              .filter(
                (l) =>
                  isDemo ||
                  memberships.some(
                    (m) => m.library_id === l.id && m.role !== "viewer",
                  ),
              )
              .find((l) => l.id === activeId) ?? personal
          )?.id ?? ""
        }
        isDemo={isDemo}
        onSave={saveDraft}
      />
      {selected && (
        <ItemDetail
          key={selected.id}
          item={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={(patch) => updateItem(selected.id, patch)}
          onDelete={() => deleteItem(selected)}
          onRefresh={() => refreshItem(selected)}
          canEdit={selectedRole === "owner" || selectedRole === "editor"}
          isDemo={isDemo}
          userId={userId}
          notify={notify}
        />
      )}
      <SharingDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        library={shareLibrary}
        userId={userId}
        isDemo={isDemo}
        onCreate={createLibrary}
        onChanged={() => user && loadAccount(user.id, true)}
        notify={notify}
      />
      <Modal
        open={Boolean(confirmLibraryDelete)}
        onClose={() => setConfirmLibraryDelete(null)}
        title="Remove this shared space?"
        subtitle="This removes the library and all of its wishlist items and conversations for everyone."
      >
        <p className="notice">
          This action cannot be undone. Your personal library is not affected.
        </p>
        <button
          className="btn danger full"
          onClick={() =>
            confirmLibraryDelete && deleteLibrary(confirmLibraryDelete)
          }
        >
          Remove {confirmLibraryDelete?.name}
        </button>
      </Modal>
    </div>
  );
}
