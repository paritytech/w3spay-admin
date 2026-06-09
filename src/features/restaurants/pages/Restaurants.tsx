// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect, useMemo, useState } from "react";

import { useNavigate } from "@tanstack/react-router";

import type { TxStatus } from "@/shared/chain/contracts/index.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";
import {
  useRestaurants,
  useRestaurantWrites,
} from "@features/restaurants/contracts/use-restaurants.ts";
import {
  EMPTY_RESTAURANT_FORM,
  restaurantPickerHint,
  restaurantToForm,
  type RestaurantForm as RestaurantFormState,
} from "@features/restaurants/restaurants.ts";
import { APrimary } from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";

import { RestaurantsList } from "@features/restaurants/components/RestaurantsList.tsx";
import { RestaurantForm } from "@features/restaurants/components/RestaurantForm.tsx";
import { HydratingNotice, MissingRestaurant } from "@features/restaurants/components/RestaurantsNotices.tsx";
import { RestaurantsListSkeleton } from "@features/restaurants/components/RestaurantsListSkeleton.tsx";

export type RestaurantsView =
  | { kind: "list" }
  | { kind: "new"; from?: string }
  | { kind: "edit"; restaurantId: string };

const SIGN_IN_REQUIRED = "Sign in via the Polkadot host to publish restaurant profiles on-chain.";

export function Restaurants({ view }: { view: RestaurantsView }) {
  const navigate = useNavigate();
  const restaurants = useRestaurants();
  const readyAccount = useSessionStore((s) => s.readyAccount);
  const writes = useRestaurantWrites(readyAccount);
  const [newForm, setNewForm] = useState<RestaurantFormState>(EMPTY_RESTAURANT_FORM);
  const [editForm, setEditForm] = useState<RestaurantFormState>(EMPTY_RESTAURANT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const busy = txStatus != null;

  const sorted = useMemo(() => {
    const list = Array.from(restaurants.restaurants.values());
    list.sort((a, b) => a.profile.name.localeCompare(b.profile.name));
    return list;
  }, [restaurants.restaurants]);

  useEffect(() => {
    if (view.kind !== "edit") {
      setEditingId(null);
      return;
    }
    const target = restaurants.getRestaurant(view.restaurantId);
    if (editingId !== view.restaurantId) {
      setEditingId(view.restaurantId);
      setEditForm(restaurantToForm(target));
      setError(null);
    }
  }, [view, restaurants, editingId]);

  if (view.kind === "new") {
    const returnTo = view.from;
    const cancel = () => {
      if (returnTo) {
        navigate({ to: "/merchants/$merchantKey/configure", params: { merchantKey: returnTo } });
      } else {
        navigate({ to: "/restaurants" });
      }
    };
    const submit = async () => {
      if (writes == null) {
        setError(SIGN_IN_REQUIRED);
        return;
      }
      const trimmedId = newForm.id.trim();
      if (trimmedId.length === 0) {
        setError("Restaurant ID is required.");
        return;
      }
      if (newForm.name.trim().length === 0) {
        setError("Restaurant name is required.");
        return;
      }
      if (newForm.merchantId.trim().length === 0) {
        setError("Merchant ID is required.");
        return;
      }
      if (restaurants.getRestaurant(trimmedId) != null) {
        setError(`A restaurant with id "${trimmedId}" already exists.`);
        return;
      }
      setError(null);
      try {
        await writes.upsert(newForm, setTxStatus);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setTxStatus(null);
        return;
      }
      setTxStatus(null);
      setNewForm(EMPTY_RESTAURANT_FORM);
      if (returnTo) {
        // Stage the picker hint BEFORE navigating — the configure screen
        // claims it during its first mount-side effect and holds it until the
        // freshly-published record lands in the polled map.
        restaurantPickerHint.set(returnTo, trimmedId);
        navigate({ to: "/merchants/$merchantKey/configure", params: { merchantKey: returnTo } });
      } else {
        // The just-published record may not be in the polled snapshot yet;
        // return to the list, which converges on the next poll.
        navigate({ to: "/restaurants" });
      }
    };
    return (
      <RestaurantForm
        mode="new"
        form={newForm}
        setForm={(next) => {
          setNewForm(next);
          if (error) setError(null);
        }}
        error={error}
        busy={busy}
        txStatus={txStatus}
        cancelLabel={returnTo ? "Cancel & return" : "Cancel"}
        onBack={cancel}
        onSubmit={submit}
      />
    );
  }

  if (view.kind === "edit") {
    const target = restaurants.getRestaurant(view.restaurantId);
    if (!restaurants.hydrated) {
      return <HydratingNotice />;
    }
    if (!target) {
      return (
        <MissingRestaurant
          id={view.restaurantId}
          onBack={() => navigate({ to: "/restaurants" })}
        />
      );
    }
    const submit = async () => {
      if (writes == null) {
        setError(SIGN_IN_REQUIRED);
        return;
      }
      if (editForm.name.trim().length === 0) {
        setError("Restaurant name is required.");
        return;
      }
      if (editForm.merchantId.trim().length === 0) {
        setError("Merchant ID is required.");
        return;
      }
      setError(null);
      try {
        await writes.upsert({ ...editForm, id: target.id }, setTxStatus);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setTxStatus(null);
        return;
      }
      setTxStatus(null);
      navigate({ to: "/restaurants" });
    };
    const remove = async () => {
      if (writes == null) {
        setError(SIGN_IN_REQUIRED);
        return;
      }
      setError(null);
      try {
        await writes.remove(target.id, setTxStatus);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setTxStatus(null);
        return;
      }
      setTxStatus(null);
      navigate({ to: "/restaurants" });
    };
    return (
      <RestaurantForm
        mode="edit"
        form={editForm}
        setForm={(next) => {
          setEditForm(next);
          if (error) setError(null);
        }}
        error={error}
        busy={busy}
        txStatus={txStatus}
        onBack={() => navigate({ to: "/restaurants" })}
        onSubmit={submit}
        onDelete={remove}
      />
    );
  }

  if (!restaurants.hydrated && sorted.length === 0) {
    return <RestaurantsListSkeleton />;
  }

  return (
    <>
      <RestaurantsList
        restaurants={sorted}
        onOpen={(id) => navigate({ to: "/restaurants/$restaurantId", params: { restaurantId: id } })}
      />
      <div style={{ height: 14 }} />
      <APrimary
        onClick={() => {
          setNewForm(EMPTY_RESTAURANT_FORM);
          setError(null);
          navigate({ to: "/restaurants/new" });
        }}
      >
        <Icon name="plus" size={14} /> New restaurant
      </APrimary>
    </>
  );
}
