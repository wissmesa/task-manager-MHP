"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, ListFilter, Plus, Trash2, X } from "lucide-react";
import {
  APPROVAL_OPTIONS,
  CREATED_OPTIONS,
  DONE_OPTIONS,
  DUE_OPTIONS,
  FILTER_FIELD_LABELS,
  FILTER_OPERATOR_LABELS,
  PRIORITY_OPTIONS,
  STAGE_OPTIONS,
  STATUS_OPTIONS,
  createEmptyGroup,
  createEmptyRule,
  getDefaultOperatorForField,
  getFieldsForTab,
  getOperatorsForField,
  operatorNeedsValues,
  type FilterField,
  type FilterGroup,
  type FilterOperator,
  type FilterRule,
  type FilterState,
} from "@/lib/task-filters";

type Option = { value: string; label: string };

interface TaskFiltersPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterState: FilterState;
  onFilterStateChange: (state: FilterState) => void;
  showStageColumn: boolean;
  departments: Option[];
  assignees: Option[];
  creators: Option[];
  currentUserDepartmentName: string | null;
}

function cloneState(state: FilterState): FilterState {
  return {
    groups: state.groups.map((group) => ({
      ...group,
      rules: group.rules.map((rule) => ({ ...rule, values: [...rule.values] })),
    })),
  };
}

function FilterValuePicker({
  field,
  operator,
  values,
  onChange,
  options,
  currentUserDepartmentName,
}: {
  field: FilterField;
  operator: FilterOperator;
  values: string[];
  onChange: (values: string[]) => void;
  options: Option[];
  currentUserDepartmentName: string | null;
}) {
  if (!operatorNeedsValues(operator)) return null;

  if (field === "title") {
    return (
      <Input
        placeholder="Enter text..."
        value={values[0] ?? ""}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      />
    );
  }

  const selectedLabels = values
    .map((value) => options.find((option) => option.value === value)?.label ?? value)
    .filter(Boolean);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-between font-normal">
          <span className="truncate text-left">
            {selectedLabels.length === 0
              ? "Select..."
              : selectedLabels.length === 1
                ? selectedLabels[0]
                : `${selectedLabels.length} selected`}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        {field === "department" && (
          <DropdownMenuCheckboxItem
            checked={values.includes("my_department")}
            onCheckedChange={(checked) => {
              onChange(
                checked
                  ? [...values.filter((v) => v !== "my_department"), "my_department"]
                  : values.filter((v) => v !== "my_department")
              );
            }}
            onSelect={(e) => e.preventDefault()}
          >
            My Department{currentUserDepartmentName ? ` (${currentUserDepartmentName})` : ""}
          </DropdownMenuCheckboxItem>
        )}
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={values.includes(option.value)}
            onCheckedChange={(checked) => {
              onChange(
                checked
                  ? [...values, option.value]
                  : values.filter((value) => value !== option.value)
              );
            }}
            onSelect={(e) => e.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskFiltersPanel({
  open,
  onOpenChange,
  filterState,
  onFilterStateChange,
  showStageColumn,
  departments,
  assignees,
  creators,
  currentUserDepartmentName,
}: TaskFiltersPanelProps) {
  const availableFields = getFieldsForTab(showStageColumn);

  const displayState = filterState.groups.length > 0 ? filterState : { groups: [createEmptyGroup()] };

  function updateState(updater: (state: FilterState) => FilterState) {
    onFilterStateChange(updater(cloneState(displayState)));
  }

  function updateGroup(groupId: string, updater: (group: FilterGroup) => FilterGroup) {
    updateState((state) => ({
      groups: state.groups.map((group) => (group.id === groupId ? updater(group) : group)),
    }));
  }

  function updateRule(groupId: string, ruleId: string, updater: (rule: FilterRule) => FilterRule) {
    updateGroup(groupId, (group) => ({
      ...group,
      rules: group.rules.map((rule) => (rule.id === ruleId ? updater(rule) : rule)),
    }));
  }

  function getOptionsForField(field: FilterField): Option[] {
    switch (field) {
      case "status":
        return STATUS_OPTIONS;
      case "priority":
        return PRIORITY_OPTIONS;
      case "stage":
        return STAGE_OPTIONS;
      case "coord_approval":
      case "dept_approval":
        return APPROVAL_OPTIONS;
      case "department":
        return departments;
      case "assignee":
        return [{ value: "__unassigned__", label: "Unassigned" }, ...assignees];
      case "creator":
        return creators;
      case "due":
        return DUE_OPTIONS;
      case "created":
        return CREATED_OPTIONS;
      case "done":
        return DONE_OPTIONS;
      default:
        return [];
    }
  }

  function addFilter(groupId: string) {
    updateGroup(groupId, (group) => ({
      ...group,
      rules: [...group.rules, createEmptyRule()],
    }));
  }

  function duplicateGroup(groupId: string) {
    updateState((state) => {
      const index = state.groups.findIndex((group) => group.id === groupId);
      if (index === -1) return state;
      const copy = cloneState({ groups: [state.groups[index]] }).groups[0];
      copy.id = createEmptyGroup().id;
      copy.rules = copy.rules.map((rule) => ({ ...rule, id: createEmptyRule().id }));
      const groups = [...state.groups];
      groups.splice(index + 1, 0, copy);
      return { groups };
    });
  }

  function removeRule(groupId: string, ruleId: string) {
    updateGroup(groupId, (group) => {
      const rules = group.rules.filter((rule) => rule.id !== ruleId);
      return { ...group, rules: rules.length > 0 ? rules : [createEmptyRule()] };
    });
  }

  function addGroup() {
    updateState((state) => ({
      groups: [...state.groups, createEmptyGroup()],
    }));
  }

  function removeGroup(groupId: string) {
    updateState((state) => {
      const groups = state.groups.filter((group) => group.id !== groupId);
      if (groups.length === 0) {
        return { groups: [createEmptyGroup()] };
      }
      return { groups };
    });
  }

  const panelGroups = useMemo(() => displayState.groups, [displayState.groups]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>All Filters</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className="mb-4 text-[11px] font-semibold tracking-wider text-muted-foreground">
              ADVANCED FILTERS
            </p>

            <div className="space-y-6">
              {panelGroups.map((group, groupIndex) => (
                <div key={group.id} className="space-y-6">
                  <div className="relative pl-4">
                    <div className="absolute bottom-0 left-0 top-0 w-px bg-border" />

                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Group {groupIndex + 1}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => duplicateGroup(group.id)}
                          title="Duplicate group"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeGroup(group.id)}
                          title="Remove group"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {group.rules.map((rule, ruleIndex) => (
                        <div key={rule.id} className="space-y-2">
                          <div className="rounded-lg border bg-background p-3 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
                                {rule.field ? (
                                  <span className="truncate text-sm font-medium">
                                    {FILTER_FIELD_LABELS[rule.field]}
                                  </span>
                                ) : (
                                  <Select
                                    value=""
                                    onValueChange={(value) => {
                                      const field = value as FilterField;
                                      updateRule(group.id, rule.id, (current) => ({
                                        ...current,
                                        field,
                                        operator: getDefaultOperatorForField(field),
                                        values: [],
                                      }));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-[180px]">
                                      <SelectValue placeholder="Select field..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableFields.map((field) => (
                                        <SelectItem key={field} value={field}>
                                          {FILTER_FIELD_LABELS[field]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => removeRule(group.id, rule.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            {rule.field && (
                              <div className="space-y-2">
                                <Select
                                  value={rule.operator}
                                  onValueChange={(value) => {
                                    const operator = value as FilterOperator;
                                    updateRule(group.id, rule.id, (current) => ({
                                      ...current,
                                      operator,
                                      values: operatorNeedsValues(operator) ? current.values : [],
                                    }));
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getOperatorsForField(rule.field).map((operator) => (
                                      <SelectItem key={operator} value={operator}>
                                        {FILTER_OPERATOR_LABELS[operator]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <FilterValuePicker
                                  field={rule.field}
                                  operator={rule.operator}
                                  values={rule.values}
                                  onChange={(values) =>
                                    updateRule(group.id, rule.id, (current) => ({ ...current, values }))
                                  }
                                  options={getOptionsForField(rule.field)}
                                  currentUserDepartmentName={currentUserDepartmentName}
                                />
                              </div>
                            )}
                          </div>
                          {ruleIndex < group.rules.length - 1 && (
                            <p className="px-1 text-xs font-medium lowercase text-muted-foreground">and</p>
                          )}
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground"
                        onClick={() => addFilter(group.id)}
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add filter
                      </Button>
                    </div>
                  </div>

                  {groupIndex < panelGroups.length - 1 && (
                    <div className="relative py-1">
                      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                      <div className="relative flex justify-center">
                        <span className="bg-background px-3 text-xs font-medium lowercase text-muted-foreground">
                          or
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="relative py-2">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
            <div className="relative flex justify-center">
              <Button type="button" variant="outline" size="sm" onClick={addGroup} className="bg-background">
                <Plus className="mr-1.5 h-4 w-4" />
                Add filter group
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ActiveFilterBadges({
  filterState,
  departments,
  assignees,
  creators,
  currentUserDepartmentName,
}: {
  filterState: FilterState;
  departments: Option[];
  assignees: Option[];
  creators: Option[];
  currentUserDepartmentName: string | null;
}) {
  const labelsByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of [
      ...STATUS_OPTIONS,
      ...PRIORITY_OPTIONS,
      ...STAGE_OPTIONS,
      ...APPROVAL_OPTIONS,
      ...DUE_OPTIONS,
      ...CREATED_OPTIONS,
      ...DONE_OPTIONS,
      ...departments,
      ...assignees,
      ...creators,
      { value: "__unassigned__", label: "Unassigned" },
      { value: "my_department", label: `My Department${currentUserDepartmentName ? ` (${currentUserDepartmentName})` : ""}` },
    ]) {
      map.set(option.value, option.label);
    }
    return map;
  }, [departments, assignees, creators, currentUserDepartmentName]);

  const badges = filterState.groups.flatMap((group, groupIndex) =>
    group.rules
      .filter((rule) => rule.field && (operatorNeedsValues(rule.operator) ? rule.values.length > 0 : true))
      .map((rule) => {
        const fieldLabel = FILTER_FIELD_LABELS[rule.field!];
        const operatorLabel = FILTER_OPERATOR_LABELS[rule.operator];
        let valueLabel = "";

        if (operatorNeedsValues(rule.operator)) {
          if (rule.field === "title") {
            valueLabel = rule.values[0] ?? "";
          } else {
            valueLabel = rule.values.map((value) => labelsByValue.get(value) ?? value).join(", ");
          }
        }

        const text = valueLabel
          ? `${fieldLabel} ${operatorLabel} ${valueLabel}`
          : `${fieldLabel} ${operatorLabel}`;

        return {
          key: `${groupIndex}-${rule.id}`,
          text,
        };
      })
  );

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <Badge key={badge.key} variant="secondary" className="font-normal">
          {badge.text}
        </Badge>
      ))}
    </div>
  );
}
