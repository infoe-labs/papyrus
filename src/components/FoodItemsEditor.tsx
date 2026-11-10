export interface FoodObservation {
  name: string;
  quantity: number | null;
  unit: string;
  preparation: string;
  texture: string;
  reaction: string;
  allergens: string;
  observedReaction: string;
}
export function foodObservations(foods: string, value: string) {
  let previous: FoodObservation[] = [];
  try {
    previous = JSON.parse(value || '[]');
  } catch {
    /* legacy meals use meal-level detail */
  }
  return foods
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(
      (name) =>
        previous.find((p) => p.name === name) ?? {
          name,
          quantity: null,
          unit: '',
          preparation: '',
          texture: '',
          reaction: '',
          allergens: '',
          observedReaction: '',
        },
    );
}
export function FoodItemsEditor({
  foods,
  value,
  onChange,
}: {
  foods: string;
  value: string;
  onChange: (s: string) => void;
}) {
  const rows = foodObservations(foods, value);
  return rows.length > 0 ? (
    <details className="food-details">
      <summary>
        Individual food details · {rows.length} {rows.length === 1 ? 'food' : 'foods'}
      </summary>
      {rows.map((food, i) => (
        <section className="interval-editor" key={food.name}>
          <h3>{food.name}</h3>
          <div className="form-grid">
            {(
              [
                'quantity',
                'unit',
                'preparation',
                'texture',
                'reaction',
                'allergens',
                'observedReaction',
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    quantity: 'Quantity',
                    unit: 'Unit',
                    preparation: 'Preparation',
                    texture: 'Texture',
                    reaction: 'Reaction to this food',
                    allergens: 'Allergen categories',
                    observedReaction: 'Observed reaction',
                  }[key]
                }
                {key === 'reaction' ? (
                  <select
                    value={food[key]}
                    onChange={(e) =>
                      onChange(
                        JSON.stringify(
                          rows.map((f, j) => (i === j ? { ...f, [key]: e.target.value } : f)),
                        ),
                      )
                    }
                  >
                    <option value="">Not recorded</option>
                    {['loved', 'liked', 'neutral', 'disliked'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={key === 'quantity' ? 'number' : 'text'}
                    step="any"
                    min={key === 'quantity' ? 0 : undefined}
                    value={food[key] ?? ''}
                    onChange={(e) =>
                      onChange(
                        JSON.stringify(
                          rows.map((f, j) =>
                            i === j
                              ? {
                                  ...f,
                                  [key]:
                                    key === 'quantity'
                                      ? e.target.value === ''
                                        ? null
                                        : Number(e.target.value)
                                      : e.target.value,
                                }
                              : f,
                          ),
                        ),
                      )
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ))}
      <p className="muted small">
        Meal-level observations above remain separate from individual food details. Preferences do
        not establish allergy status.
      </p>
    </details>
  ) : null;
}
