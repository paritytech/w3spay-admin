/**
 * Restaurants tab orchestrator.
 *
 * View-driven: receives the active sub-view as a `view` prop and pulls
 * `navigate` from TanStack Router.
 * Each subroute mounts a different presentational screen and the
 * orchestrator owns the form state + the mutation glue against the
 * `useRestaurants` hook.
 *
 * Sub-routes:
 *   - `restaurants`              → list
 *   - `restaurants/new`          → create form (stand-alone)
 *   - `restaurants/new` w/ returnToMerchantKey → create form whose
 *     successful submit hops back to `merchants/configure-t3rminal/
 *     <merchantKey>` and stages a picker hint so the new restaurant
 *     is pre-selected there.
 *   - `restaurants/edit/<id>`    → edit form (id locked)
 */

import { useEffect, useMemo, useState } from "react";

import { useNavigate } from "@tanstack/react-router";

import { useRestaurants } from "@features/restaurants/store/use-restaurants-store.ts";
import {
  EMPTY_RESTAURANT_FORM,
  formToRestaurant,
  restaurantPickerHint,
  restaurantToForm,
  type RestaurantForm as RestaurantFormState,
} from "@features/restaurants/restaurants.ts";
import { APrimary, AGhost } from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR } from "@shared/components/tokens.ts";

import { RestaurantsList } from "@features/restaurants/components/RestaurantsList.tsx";
import { RestaurantForm } from "@features/restaurants/components/RestaurantForm.tsx";

export type RestaurantsView =
  | { kind: "list" }
  | { kind: "new"; from?: string }
  | { kind: "edit"; restaurantId: string };

export function Restaurants({ view }: { view: RestaurantsView }) {
  const navigate = useNavigate();
  const restaurants = useRestaurants();
  const [newForm, setNewForm] = useState<RestaurantFormState>(EMPTY_RESTAURANT_FORM);
  const [editForm, setEditForm] = useState<RestaurantFormState>(EMPTY_RESTAURANT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = Array.from(restaurants.restaurants.values());
    list.sort((a, b) => a.profile.name.localeCompare(b.profile.name));
    return list;
  }, [restaurants.restaurants]);

  // Seed the edit form when the view lands on an edit sub-view (or the
  // underlying record refreshes), and reset it when we navigate away
  // from that screen entirely so a stale entry doesn't leak into the
  // next edit session.
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
    const submit = () => {
      const trimmedId = newForm.id.trim();
      if (trimmedId.length === 0) {
        setError("Restaurant ID is required.");
        return;
      }
      if (restaurants.getRestaurant(trimmedId) != null) {
        setError(`A restaurant with id "${trimmedId}" already exists.`);
        return;
      }
      const restaurant = formToRestaurant(newForm);
      if (restaurant == null) {
        setError("Restaurant name is required.");
        return;
      }
      restaurants.upsertRestaurant(restaurant);
      setNewForm(EMPTY_RESTAURANT_FORM);
      setError(null);
      if (returnTo) {
        // Stage the picker hint BEFORE navigating — the configure
        // screen claims it during its first mount-side effect.
        restaurantPickerHint.set(returnTo, restaurant.id);
        navigate({ to: "/merchants/$merchantKey/configure", params: { merchantKey: returnTo } });
      } else {
        navigate({ to: "/restaurants/$restaurantId", params: { restaurantId: restaurant.id } });
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
    const submit = () => {
      const restaurant = formToRestaurant(editForm);
      if (restaurant == null) {
        setError("Restaurant name is required.");
        return;
      }
      // Preserve the existing id even if the form somehow mutated it
      // — edit mode renders the slug as a read-only chip, but belt &
      // suspenders against an unexpected setForm with a different id.
      restaurants.upsertRestaurant({ ...restaurant, id: target.id });
      setError(null);
      navigate({ to: "/restaurants" });
    };
    const remove = () => {
      restaurants.removeRestaurant(target.id);
      setError(null);
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
        onBack={() => navigate({ to: "/restaurants" })}
        onSubmit={submit}
        onDelete={remove}
      />
    );
  }

  // restaurants (list)
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

function HydratingNotice() {
  return (
    <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
      Loading restaurants…
    </div>
  );
}

function MissingRestaurant({ id, onBack }: { id: string; onBack: () => void }) {
  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Back
      </AGhost>
      <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
        No restaurant with id "{id}".
      </div>
    </>
  );
}
