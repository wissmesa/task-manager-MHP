"use client";

import { useState, useTransition } from "react";
import { updateUserDepartment, updateDepartmentBoss } from "@/lib/actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Crown, Users } from "lucide-react";

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface Department {
  id: string;
  name: string;
  bossId: string | null;
  bossName: string | null;
}

interface HierarchyManagerProps {
  users: User[];
  departments: Department[];
  deptMap: Record<string, string>;
}

export function HierarchyManager({ users, departments, deptMap }: HierarchyManagerProps) {
  const [localDeptMap, setLocalDeptMap] = useState(deptMap);
  const [localDeptBosses, setLocalDeptBosses] = useState<Record<string, string | null>>(
    () => {
      const map: Record<string, string | null> = {};
      for (const d of departments) {
        map[d.id] = d.bossId;
      }
      return map;
    }
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingType, setSavingType] = useState<"dept" | "boss" | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDeptChange(userId: string, newDeptId: string) {
    const departmentId = newDeptId === "none" ? null : newDeptId;

    setLocalDeptMap((prev) => {
      const next = { ...prev };
      if (departmentId) {
        next[userId] = departmentId;
      } else {
        delete next[userId];
      }
      return next;
    });

    setSavingId(userId);
    setSavingType("dept");
    startTransition(async () => {
      try {
        await updateUserDepartment(userId, departmentId);
      } catch (err) {
        console.error("Failed to update department:", err);
        setLocalDeptMap((prev) => {
          const next = { ...prev };
          if (deptMap[userId]) {
            next[userId] = deptMap[userId];
          } else {
            delete next[userId];
          }
          return next;
        });
      } finally {
        setSavingId(null);
        setSavingType(null);
      }
    });
  }

  function handleDeptBossChange(deptId: string, newBossId: string) {
    const bossId = newBossId === "none" ? null : newBossId;

    setLocalDeptBosses((prev) => ({ ...prev, [deptId]: bossId }));

    setSavingId(deptId);
    setSavingType("boss");
    startTransition(async () => {
      try {
        await updateDepartmentBoss(deptId, bossId);
      } catch (err) {
        console.error("Failed to update department boss:", err);
        const original = departments.find((d) => d.id === deptId);
        setLocalDeptBosses((prev) => ({
          ...prev,
          [deptId]: original?.bossId ?? null,
        }));
      } finally {
        setSavingId(null);
        setSavingType(null);
      }
    });
  }

  function getUsersInDept(deptId: string) {
    return users.filter((u) => localDeptMap[u.id] === deptId);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Crown className="h-5 w-5" />
            Department Coordinators
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Department</TableHead>
                <TableHead>Current Coordinator</TableHead>
                <TableHead className="w-[40%]">Assign Coordinator</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {users.find((u) => u.id === localDeptBosses[dept.id])?.fullName ?? (
                      <span className="italic">Not assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={localDeptBosses[dept.id] ?? "none"}
                        onValueChange={(val) => handleDeptBossChange(dept.id, val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select coordinator..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No coordinator</SelectItem>
                          {getUsersInDept(dept.id).map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isPending && savingId === dept.id && savingType === "boss" && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-[25%]">Department</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const userDeptId = localDeptMap[user.id];
                const isBoss = userDeptId && localDeptBosses[userDeptId] === user.id;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {user.fullName}
                        {isBoss && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            <Crown className="mr-1 h-3 w-3" />
                            Coordinator
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={localDeptMap[user.id] ?? "none"}
                          onValueChange={(val) => handleDeptChange(user.id, val)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="No department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No department</SelectItem>
                            {departments.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isPending && savingId === user.id && savingType === "dept" && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
