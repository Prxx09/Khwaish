"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Check,
  Download,
  FolderHeart,
  Grid2X2,
  LayoutGrid,
  List,
  LoaderCircle,
  LogIn,
  LogOut,
  Moon,
  MoreHorizontal,
  Plus,
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
  money,
  priceDrop,
  safeUrl,
  STATUS_LABELS,
  type Item,
  type Library,
  type Member,
  type Profile,
} from "@/lib/types";
import {
  Avatar,
  Brand,
  EmptyState,
  ErrorText,
  Skeletons,
  ProductImage,
  Toast,
  ConfirmDialog,
  type ToastKind,
} from "./ui";
import AuthDialog from "./auth-dialog";
import CaptureDialog, { type Draft } from "./capture-dialog";
import ProductCard from "./product-card";
import PriceWatch from "./price-watch";
import ItemDetail from "./item-detail";
import SharingDialog from "./sharing-dialog";
import { WishOrbit } from "./wish-orbit";
import SearchField from "./search-field";
import { createWishMatcher } from "./wish-search";

type View = "shelf" | "shared" | "watch" | "ask" | "settings";
const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
const NAV = [
  { id: "shelf", name: "My shelf", Icon: LayoutGrid },
  { id: "shared", name: "Shared spaces", Icon: Users },
  { id: "watch", name: "Price watch", Icon: TrendingDown },
  { id: "ask", name: "Ask Khwaish", Icon: Sparkles },
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
  const [authOpen, setAuthOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLibrary, setShareLibrary] = useState<Library | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    kind: ToastKind;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [smartSearch, setSmartSearch] = useState(true);
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState("newest");
  const [layout, setLayout] = useState("grid");
  const [query, setQuery] = useState("");
  const [queryScope, setQueryScope] = useState("all");
  const [chatTurns, setChatTurns] = useState<
    {
      id: string;
      question: string;
      result: QueryResult;
      mode: "ai" | "local";
    }[]
  >([]);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [queryBusy, setQueryBusy] = useState(false);
  const queryVersion = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view !== "ask") return;
    const scroll = chatScrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [view, chatTurns.length, pendingQuestion]);
  useEffect(() => {
    queryVersion.current++;
    setChatTurns([]);
    setPendingQuestion("");
    setQueryBusy(false);
  }, [queryScope, user?.id]);
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
  const [spaceDeleting, setSpaceDeleting] = useState(false);
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
  const chatScopeItems =
    queryScope === "all"
      ? items
      : items.filter((i) => i.library_id === queryScope);
  const chatSuggestions = (() => {
    if (!chatScopeItems.length) return [];
    const prompts: string[] = [];
    const categories = [
      ...new Set(chatScopeItems.map((i) => i.category).filter(Boolean)),
    ];
    const category = categories[0];
    const priced = chatScopeItems
      .filter(
        (i) =>
          i.category === category &&
          i.currency.trim() === "INR" &&
          currentPrice(i) != null,
      )
      .map((i) => currentPrice(i)!)
      .sort((a, b) => a - b);
    if (category)
      prompts.push(
        priced.length
          ? `Show ${category.toLowerCase()} under ₹${Math.ceil((priced[Math.floor(priced.length / 2)] + 1) / 500) * 500}`
          : `Show ${category.toLowerCase()}`,
      );
    if (chatScopeItems.some((i) => priceDrop(i) > 0))
      prompts.push("What got cheaper?");
    if (chatScopeItems.some((i) => i.priority === "high"))
      prompts.push("Show my must-haves");
    prompts.push("What is the total cost?");
    if (categories.length > 1)
      prompts.push(`Show ${categories[1]!.toLowerCase()}`);
    return prompts.slice(0, 4);
  })();
  const selectedRole = isDemo
    ? "owner"
    : memberships.find(
        (m) => m.library_id === selected?.library_id && m.user_id === userId,
      )?.role;
  const notify = useCallback(
    (message: string, kind: ToastKind = "info") =>
      setToast({ id: Date.now(), message, kind }),
    [],
  );

  useEffect(() => {
    if (shareOpen && isDemo) {
      setShareOpen(false);
      setAuthOpen(true);
      notify("Sign in to create a shared space with your people.");
    }
  }, [shareOpen, isDemo, notify]);

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
      notify(
        "That sign-in link could not be verified. Please sign in again.",
        "error",
      );
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
    window.scrollTo({ top: 0, behavior: "auto" });
    setCategory("All");
    setStatus("all");
    setPriority("all");
    queryVersion.current++;
    setQueryBusy(false);
    setPendingQuestion("");
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
    if (libraryId) setActiveId(libraryId);
    else if (next === "shelf" && personal) setActiveId(personal.id);
  }
  const scopeItems =
    view === "watch"
      ? items.filter((i) => i.status !== "purchased" && i.status !== "not_now")
      : items.filter((i) => i.library_id === activeId);
  const visible = useMemo(() => {
    const matchesSearch = createWishMatcher(search, smartSearch);
    let result = scopeItems.filter(
      (i) =>
        (category === "All" || i.category === category) &&
        (status === "all" || i.status === status) &&
        (priority === "all" || i.priority === priority) &&
        matchesSearch(i),
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
  }, [scopeItems, category, status, priority, search, smartSearch, sort]);
  const watchDrops = items.filter(
    (i) =>
      priceDrop(i) > 0 && i.status !== "purchased" && i.status !== "not_now",
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
      notify(
        "Saved on this device. Sign in to save wishes to your account.",
        "success",
      );
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
    notify(
      `A new wish, safely shelved.${mediaWarning}`,
      mediaWarning ? "info" : "success",
    );
    return true;
  }
  async function updateItem(id: string, patch: Partial<Item>) {
    const old = items.find((i) => i.id === id);
    setItems((items) =>
      items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
    if (isDemo) {
      notify(patch.priority ? "Priority updated." : "Wish updated.", "success");
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
      notify("Use a valid public product link.", "error");
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
      notify(error.message, "error");
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
    notify("Wish removed from your shelf.", "success");
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
      "success",
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
    notify("Shared space created.", "success");
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
      notify("You’re in. Welcome to your shared space.", "success");
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String(e.message)
            : "Could not join this space.",
        "error",
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
          "error",
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
      notify("Your profile is updated.", "success");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Profile could not be updated.",
        "error",
      );
    } finally {
      setSettingsBusy(false);
    }
  }
  async function runQuery(text = query) {
    if (!text.trim() || queryBusy) return;
    const version = ++queryVersion.current;
    setQuery("");
    setPendingQuestion(text);
    const complete = (result: QueryResult, mode: "ai" | "local") => {
      setChatTurns((turns) => [
        ...turns.slice(-19),
        { id: crypto.randomUUID(), question: text, result, mode },
      ]);
      setPendingQuestion("");
    };
    const scoped =
      queryScope === "all"
        ? items
        : items.filter((item) => item.library_id === queryScope);
    if (isDemo || !statusInfo.aiWishlist) {
      complete(queryWishlist(text, scoped, userId), "local");
      return;
    }
    setQueryBusy(true);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          libraryId: queryScope,
          history: chatTurns.slice(-4).map((turn) => ({
            question: turn.question,
            answer: turn.result.answer.slice(0, 3000),
            ids: turn.result.items.slice(0, 50).map((item) => item.id),
          })),
        }),
        signal: AbortSignal.timeout(35000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (version !== queryVersion.current) return;
      complete(
        {
          ...body,
          items: body.ids.flatMap((id: string) => {
            const item = scoped.find((item) => item.id === id);
            return item ? [item] : [];
          }),
        },
        "ai",
      );
    } catch (error) {
      if (version === queryVersion.current) {
        complete(queryWishlist(text, scoped, userId), "local");
        notify(
          error instanceof Error
            ? error.message
            : "AI search unavailable. Showing local matches.",
          "error",
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
    anchor.download = "Khwaish-wishlist.csv";
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
            "Could not remove all screenshots. The space has been kept; please try again.",
            "error",
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
        notify(error.message, "error");
        return;
      }
      await loadAccount(user!.id, true);
    }
    setConfirmLibraryDelete(null);
    setActiveId(personal?.id ?? "");
    notify("Shared space removed.", "success");
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <button
          className="header-brand"
          aria-label="Khwaish — My shelf"
          onClick={() => go("shelf")}
        >
          <Brand />
        </button>
        <nav className="desktop-nav" aria-label="Main navigation">
          {NAV.map(({ id, name, Icon }) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              <span>{name}</span>
              <span className="nav-count">
                {id === "shelf"
                  ? items.filter((i) => i.library_id === personal?.id).length
                  : id === "shared"
                    ? shared.length
                    : id === "watch"
                      ? watchDrops.length
                      : chatTurns.length}
              </span>
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "Daydream" : "After hours"} theme`}
            title={theme === "dark" ? "After hours" : "Daydream"}
          >
            {theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}
            <span className="theme-name">
              {theme === "dark" ? "After hours" : "Daydream"}
            </span>
          </button>
          <button
            className="icon-btn notification-btn"
            onClick={() => go("watch")}
            aria-label={`Price watch — ${watchDrops.length} recorded drops`}
            title="Price watch"
          >
            <Bell size={20} />
            <span className="notification-count">{watchDrops.length}</span>
          </button>
          <button
            className="account-trigger"
            popoverTarget="account-menu"
            aria-label="Account menu"
            title="Account menu"
          >
            <Avatar name={isDemo ? "You" : displayName} />
          </button>
          <div className="account-menu" id="account-menu" popover="auto">
            <strong>{isDemo ? "Your guest shelf" : displayName}</strong>
            <small>{isDemo ? "Saved on this device" : user?.email}</small>
            <button
              onClick={() => {
                document.getElementById("account-menu")?.hidePopover();
                go("settings");
              }}
            >
              <Settings2 size={18} />
              Profile & settings
            </button>
            <button
              onClick={() => {
                document.getElementById("account-menu")?.hidePopover();
                if (isDemo) setAuthOpen(true);
                else void signOut();
              }}
            >
              {isDemo ? <LogIn size={18} /> : <LogOut size={18} />}
              {isDemo ? "Sign in" : "Sign out"}
            </button>
          </div>
        </div>
      </header>
      <div className="app-main">
        <main
          id="main-content"
          className={`main-content${view === "ask" ? " chat-main" : ""}`}
        >
          {pendingInvite && (
            <div className="invite-banner">
              <Users size={22} />
              <div>
                <strong>A shared space is waiting for you.</strong>
                <p>
                  {user
                    ? "Join your friend’s space and start wishing together."
                    : "Sign in or create an account to join your friend’s space."}
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
          {view === "shelf" && (
            <>
              <section className="shelf-heading">
                <div>
                  <span className="eyebrow">
                    {activeLibrary?.kind === "shared"
                      ? "SHARED SPACE"
                      : "CURATED BY YOU"}
                  </span>
                  <h1>
                    {activeLibrary?.kind === "shared" ? (
                      activeLibrary.name
                    ) : (
                      <>
                        Your shelf, <em>your taste.</em>
                      </>
                    )}
                  </h1>
                  <p className="shelf-caption">
                    Good taste. Great timing. All yours.
                  </p>
                </div>
                <WishOrbit />
                <div className="section-actions">
                  {activeLibrary?.kind === "shared" && view === "shelf" && (
                    <button
                      className="btn secondary"
                      onClick={() => {
                        setShareLibrary(activeLibrary);
                        setShareOpen(true);
                      }}
                    >
                      <Users size={18} />
                      People
                    </button>
                  )}
                  <button
                    className="btn primary"
                    onClick={() => setCaptureOpen(true)}
                    disabled={!canEdit}
                  >
                    <Plus size={18} />
                    Add a wish
                  </button>
                </div>
              </section>
              <div className="shelf-context">
                {view === "shelf" && (
                  <div className="space-switcher">
                    <label htmlFor="shelf-scope">Browsing</label>
                    <select
                      id="shelf-scope"
                      value={activeId}
                      onChange={(e) => go("shelf", e.target.value)}
                    >
                      {libraries.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.kind === "personal" ? "My shelf" : l.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-btn"
                      onClick={() => {
                        setShareLibrary(undefined);
                        setShareOpen(true);
                      }}
                      aria-label="Create a shared space"
                    >
                      <Plus size={18} />
                      <span>Create space</span>
                    </button>
                  </div>
                )}
                <div
                  className="stats-strip"
                  aria-label="Current shelf or space overview"
                >
                  <span>
                    <strong>{scopeItems.length}</strong> wishes
                  </span>
                  <span className={value === 0 ? "stat-zero" : ""}>
                    <strong>{money(value)}</strong>{" "}
                    {activeLibrary?.kind === "shared"
                      ? "space value · INR"
                      : "shelf value · INR"}
                  </span>
                  {savings > 0 && (
                    <span className="green-text">
                      <strong>{money(savings)}</strong> in recorded drops
                    </span>
                  )}
                </div>
              </div>
              <section className="shelf-section" aria-label="Wishes">
                <div className="shelf-toolbar">
                  <div className="filter-bar">
                    <SearchField
                      value={search}
                      onChange={setSearch}
                      smart={smartSearch}
                      onSmartChange={setSmartSearch}
                      label="Search wishes"
                    />
                    <details className="filter-popover">
                      <summary>
                        <Settings2 size={18} />
                        Filters
                        {(status !== "all" || priority !== "all") && (
                          <span className="count-badge">
                            {Number(status !== "all") +
                              Number(priority !== "all")}
                          </span>
                        )}
                      </summary>
                      <div className="filter-menu">
                        <label>
                          Status
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
                        </label>
                        <label>
                          Priority
                          <select
                            aria-label="Filter priority"
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                          >
                            <option value="all">All priorities</option>
                            <option value="high">Must-have</option>
                            <option value="medium">Would love</option>
                            <option value="low">Someday</option>
                          </select>
                        </label>
                        <button
                          className="text-btn"
                          onClick={() => {
                            setStatus("all");
                            setPriority("all");
                          }}
                        >
                          Reset filters
                        </button>
                      </div>
                    </details>
                    <select
                      aria-label="Sort wishes"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="newest">Recently added</option>
                      <option value="price-low">Price: low to high</option>
                      <option value="price-high">Price: high to low</option>
                      <option value="drop">Biggest price drops</option>
                    </select>
                    <div className="view-toggle" aria-label="Wish layout">
                      <button
                        aria-label="Grid view"
                        aria-pressed={layout === "grid"}
                        className={layout === "grid" ? "active" : ""}
                        onClick={() => setLayout("grid")}
                      >
                        <Grid2X2 size={18} />
                      </button>
                      <button
                        aria-label="List view"
                        aria-pressed={layout === "list"}
                        className={layout === "list" ? "active" : ""}
                        onClick={() => setLayout("list")}
                      >
                        <List size={18} />
                      </button>
                    </div>
                    <button
                      className="btn secondary export-btn"
                      onClick={exportCsv}
                      aria-label="Export wishes as CSV"
                      title="Export this shelf or space as CSV"
                    >
                      <Download size={18} />
                      Export
                    </button>
                  </div>
                  <div className="category-tabs" aria-label="Wish categories">
                    <button
                      className={category === "All" ? "active" : ""}
                      aria-pressed={category === "All"}
                      onClick={() => setCategory("All")}
                    >
                      All wishes<span>{scopeItems.length}</span>
                    </button>
                    {CATEGORIES.filter((c) =>
                      scopeItems.some((i) => i.category === c),
                    ).map((c) => (
                      <button
                        key={c}
                        aria-pressed={category === c}
                        className={category === c ? "active" : ""}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                {!scopeItems.length && authReady && !loading && !loadError && (
                  <aside className="empty-shelf-banner">
                    <Sparkles size={28} />
                    <p>
                      Good things <em>ahead.</em>
                    </p>
                    <span>One wish at a time.</span>
                  </aside>
                )}
                {loading || !authReady ? (
                  <Skeletons />
                ) : loadError ? (
                  <EmptyState
                    title="Your wishes couldn’t load."
                    body="Use Try again above to reconnect to your shelf."
                  />
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
                      search ||
                      category !== "All" ||
                      status !== "all" ||
                      priority !== "all"
                        ? "No wishes match just yet."
                        : "Make room for your next favourite."
                    }
                    body={
                      search ||
                      category !== "All" ||
                      status !== "all" ||
                      priority !== "all"
                        ? "Try another search or reset your filters."
                        : "Paste a product link, use a screenshot, or add the details yourself."
                    }
                    action={
                      search ||
                      category !== "All" ||
                      status !== "all" ||
                      priority !== "all" ? (
                        <button
                          className="btn secondary"
                          onClick={() => {
                            setSearch("");
                            setCategory("All");
                            setStatus("all");
                            setPriority("all");
                          }}
                        >
                          Reset filters
                        </button>
                      ) : undefined
                    }
                  />
                )}
              </section>
            </>
          )}
          {view === "watch" && (
            <PriceWatch
              items={scopeItems}
              isDemo={isDemo}
              loading={loading || !authReady}
              error={loadError}
              canEdit={(item) =>
                !isDemo &&
                memberships.some(
                  (m) =>
                    m.library_id === item.library_id && m.role !== "viewer",
                )
              }
              onSelect={(item) => setSelectedId(item.id)}
              onRefresh={refreshItem}
              onExport={exportCsv}
            />
          )}
          {view === "shared" && (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">YOUR PEOPLE. YOUR PLANS.</span>
                  <h1>
                    Better <em>together.</em>
                  </h1>
                  <p>
                    One space for your next home, birthday plans, or the wishes
                    you keep sending each other.
                  </p>
                </div>
                <button
                  className="btn primary"
                  onClick={() => {
                    setShareLibrary(undefined);
                    setShareOpen(true);
                  }}
                >
                  <Plus size={18} />
                  Create a shared space
                </button>
              </section>
              {loading || !authReady ? (
                <Skeletons />
              ) : loadError ? (
                <EmptyState
                  title="Your spaces couldn’t load."
                  body="Use Try again above to reconnect."
                />
              ) : shared.length ? (
                <div className="spaces-grid">
                  {shared.map((lib) => {
                    const wishes = items.filter((i) => i.library_id === lib.id);
                    const total = wishes
                      .filter((i) => i.currency.trim() === "INR")
                      .reduce((n, i) => n + (currentPrice(i) ?? 0), 0);
                    const role =
                      isDemo && lib.owner_id === userId
                        ? "owner"
                        : memberships.find(
                            (m) =>
                              m.library_id === lib.id && m.user_id === userId,
                          )?.role;
                    return (
                      <article className="space-card" key={lib.id}>
                        <div className="space-card-top">
                          <span className="space-card-icon">
                            <FolderHeart size={26} />
                          </span>
                          <span className="pill">
                            {lib.owner_id === userId
                              ? "Owner"
                              : `Joined · ${role || "Member"}`}
                          </span>
                          {lib.owner_id === userId && (
                            <details className="space-overflow">
                              <summary
                                aria-label={`More actions for ${lib.name}`}
                                title="More actions"
                              >
                                <MoreHorizontal size={20} />
                              </summary>
                              <button
                                onClick={() => setConfirmLibraryDelete(lib)}
                              >
                                Remove space
                              </button>
                            </details>
                          )}
                        </div>
                        <h2>{lib.name}</h2>
                        <p>
                          {wishes.length} wishes · {money(total)} total · INR
                        </p>
                        <div className="space-card-bottom">
                          <button
                            className="btn primary"
                            onClick={() => go("shelf", lib.id)}
                          >
                            Open
                            <ArrowRight size={18} />
                          </button>
                          <button
                            className="btn secondary"
                            aria-label={`People in ${lib.name}`}
                            onClick={() => {
                              setShareLibrary(lib);
                              setShareOpen(true);
                            }}
                          >
                            <Users size={18} />
                            People
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="Good taste deserves good company."
                  body={
                    isDemo
                      ? "Sign in to create a space, invite your people, and save wishes together."
                      : "Create your first space for a shared plan. Your shelf stays private."
                  }
                />
              )}
              <div className="privacy-note">
                <ShieldCheck size={20} />
                <div>
                  <strong>Sharing is always your choice.</strong>
                  <p>
                    Your shelf stays private. Space editors can add and edit;
                    viewers can browse and comment. Invitations expire after 7
                    days.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "ask" && (
            <section className="chat-page" aria-label="Ask Khwaish">
              <header className="chat-header">
                <h1>
                  Ask <em>Khwaish.</em>
                </h1>
                <div className="query-scope">
                  <button
                    type="button"
                    className="text-btn"
                    disabled={!chatTurns.length && !query && !queryBusy}
                    onClick={() => {
                      queryVersion.current++;
                      setQueryBusy(false);
                      setQuery("");
                      setChatTurns([]);
                      setPendingQuestion("");
                      notify("Conversation cleared.");
                    }}
                  >
                    Clear chat
                  </button>
                  <span>Look in</span>
                  <select
                    aria-label="Query shelf or space"
                    value={queryScope}
                    onChange={(e) => {
                      setQueryScope(e.target.value);
                      queryVersion.current++;
                      setQueryBusy(false);
                    }}
                  >
                    <option value="all">My shelf + all spaces</option>
                    {libraries.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.kind === "personal" ? "My shelf" : l.name}
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
              </header>
              <div className="chat-scroll" ref={chatScrollRef}>
                {chatTurns.length || pendingQuestion ? (
                  <section
                    className="chat-transcript"
                    aria-label="Wishlist conversation"
                    role="log"
                    aria-live="polite"
                  >
                    {chatTurns.map((turn) => (
                      <article className="chat-turn" key={turn.id}>
                        <div className="chat-question">
                          <span>You</span>
                          <p>{turn.question}</p>
                        </div>
                        <div className="chat-reply">
                          <div className="chat-speaker">
                            <Sparkles size={17} />
                            <strong>Khwaish</strong>
                            <small>
                              {turn.mode === "ai" ? "AI" : "Local match"}
                            </small>
                          </div>
                          <p className="chat-answer-text">
                            {turn.result.answer}
                          </p>
                          {turn.result.items.length > 0 && (
                            <div
                              className="chat-attachments"
                              aria-label="Related product attachments"
                            >
                              {turn.result.items
                                .slice(0, 6)
                                .map((attachment) => (
                                  <button
                                    type="button"
                                    className="chat-attachment"
                                    key={attachment.id}
                                    onClick={() => setSelectedId(attachment.id)}
                                  >
                                    <ProductImage
                                      src={
                                        attachment.product_media?.[0]
                                          ?.signed_url || attachment.image_url
                                      }
                                      name={attachment.product_name}
                                    />
                                    <span>
                                      <strong>{attachment.product_name}</strong>
                                      <small>
                                        {money(
                                          currentPrice(attachment),
                                          attachment.currency,
                                        )}{" "}
                                        ·{" "}
                                        {attachment.retailer ||
                                          attachment.category}
                                      </small>
                                    </span>
                                    <ArrowUpRight size={17} />
                                  </button>
                                ))}
                            </div>
                          )}
                          {turn.result.items.length > 6 && (
                            <p className="chat-caption">
                              Showing 6 of {turn.result.items.length} matching
                              wishes.
                            </p>
                          )}
                          <p className="chat-caption">
                            Based on saved details and recorded prices.
                          </p>
                        </div>
                      </article>
                    ))}
                    {pendingQuestion && (
                      <article className="chat-turn">
                        <div className="chat-question">
                          <span>You</span>
                          <p>{pendingQuestion}</p>
                        </div>
                        <p className="chat-thinking" role="status">
                          <LoaderCircle size={17} className="spin" />
                          Looking through your wishlist…
                        </p>
                      </article>
                    )}
                  </section>
                ) : (
                  <div className="chat-welcome">
                    <WishOrbit compact />
                    <h2>
                      {chatScopeItems.length
                        ? "What’s on your mind?"
                        : "Your wishes start the conversation."}
                    </h2>
                    <p>
                      {chatScopeItems.length
                        ? "Find a wish, compare recorded prices, or plan your next purchase."
                        : "Add a wish to your shelf or choose a space with saved wishes, then ask about it here."}
                    </p>
                    <div className="query-prompts">
                      {chatSuggestions.map((p) => (
                        <button
                          disabled={queryBusy}
                          onClick={() => runQuery(p)}
                          key={p}
                        >
                          {p}
                          <ArrowUpRight size={13} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="query-panel">
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
                    placeholder={
                      chatSuggestions[0]
                        ? `${chatSuggestions[0]}…`
                        : "Ask about your saved wishes…"
                    }
                  />
                  <button
                    className="icon-btn accent"
                    disabled={!query.trim() || queryBusy}
                    aria-label="Ask question"
                  >
                    {queryBusy ? (
                      <LoaderCircle size={21} className="spin" />
                    ) : (
                      <ArrowUp size={21} />
                    )}
                  </button>
                </form>

                <p className="chat-composer-note">
                  Answers use saved wishlist details and recorded prices.
                </p>
              </div>
            </section>
          )}
          {view === "settings" && (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                  <h1>
                    Very <em>you.</em>
                  </h1>
                  <p>
                    Your profile, your preferences, your little wishlist
                    universe.
                  </p>
                </div>
              </section>
              {loading || !authReady ? (
                <Skeletons />
              ) : loadError ? (
                <EmptyState
                  title="Your settings couldn’t load."
                  body="Use Try again above to reconnect. Your saved profile has not changed."
                />
              ) : (
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
                    <p className="muted">
                      A little light. A little after-hours.
                    </p>
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
                      Animations automatically tone down when your device asks
                      for reduced motion.
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
                        Your shelf is private by default.
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
                        AI search uses only your shelf and spaces you can
                        access; selected product details are sent to the AI
                        service.
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
              )}
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
            aria-current={view === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            <Icon size={20} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          kind={toast.kind}
          onClose={() => setToast(null)}
        />
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
          notify={(message) =>
            notify(
              message,
              /No messages|manually/i.test(message) ? "info" : "success",
            )
          }
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
        notify={(message) =>
          notify(message, /manually/i.test(message) ? "info" : "success")
        }
      />
      <ConfirmDialog
        open={Boolean(confirmLibraryDelete)}
        onClose={() => setConfirmLibraryDelete(null)}
        title="Remove this space?"
        description="This removes the space, all its wishes, and conversations for everyone. Your shelf is not affected. This cannot be undone."
        confirmLabel={`Remove ${confirmLibraryDelete?.name ?? "space"}`}
        busy={spaceDeleting}
        onConfirm={async () => {
          if (!confirmLibraryDelete) return;
          setSpaceDeleting(true);
          try {
            await deleteLibrary(confirmLibraryDelete);
          } finally {
            setSpaceDeleting(false);
          }
        }}
      />
    </div>
  );
}
