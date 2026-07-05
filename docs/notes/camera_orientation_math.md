# Camera Orientation Math

Pretty Lattice follows the VESTA-style split between one direct-lattice direction
and one reciprocal-lattice direction. Let

$$
\mathbf a_1=\mathbf a,\qquad
\mathbf a_2=\mathbf b,\qquad
\mathbf a_3=\mathbf c
$$

and let

$$
\mathbf a^1=\mathbf a^*,\qquad
\mathbf a^2=\mathbf b^*,\qquad
\mathbf a^3=\mathbf c^*
$$

be the reciprocal basis, omitting the conventional factor of $2\pi$, so that

$$
\mathbf a_i\cdot \mathbf a^j=\delta_i^{\,j}.
$$

The camera uses a right-handed screen coordinate frame:

$$
X=\text{right},\qquad Y=\text{up},\qquad Z=\text{out},
\qquad X\times Y=Z.
$$

The selected primary screen direction is represented by direct-lattice
coefficients:

$$
\mathbf p_0=u\mathbf a+v\mathbf b+w\mathbf c.
$$

The selected secondary screen direction is represented by reciprocal-lattice
coefficients:

$$
\mathbf s_0=h\mathbf a^*+k\mathbf b^*+l\mathbf c^*.
$$

This is the useful part of the convention: their perpendicularity condition is
just the coefficient pairing

$$
\mathbf p_0\cdot \mathbf s_0=uh+vk+wl.
$$

Therefore an exactly compatible pair satisfies

$$
uh+vk+wl=0,
$$

independent of the cell angles.

For numerical input, the primary screen direction is kept fixed. We first normalize
it,

$$
\mathbf p=\frac{\mathbf p_0}{\lVert\mathbf p_0\rVert},
$$

then remove the primary-direction component from the secondary direction:

$$
\tilde{\mathbf s}=\mathbf s_0-(\mathbf s_0\cdot \mathbf p)\mathbf p.
$$

If this projected vector is nonzero, the secondary direction used by the camera
is

$$
\mathbf s=\frac{\tilde{\mathbf s}}{\lVert\tilde{\mathbf s}\rVert}.
$$

Thus a non-orthogonal manual pair is interpreted as: keep the primary direction,
and orthogonalize the secondary direction against it.

If $\lVert\tilde{\mathbf s}\rVert$ is too small, the submitted secondary
direction does not determine a roll angle around $\mathbf p$. In that case the
camera uses the cyclic direct-lattice roll anchor from
[Use Cyclic Crystal Orientation for Camera Roll Zero](../decisions/cyclic-crystal-camera-orientation.md).
Define

$$
T(\mathbf a)=\mathbf b,\qquad
T(\mathbf b)=\mathbf c,\qquad
T(\mathbf c)=\mathbf a.
$$

For

$$
\mathbf p_0=u\mathbf a+v\mathbf b+w\mathbf c,
$$

the first roll-anchor candidate is

$$
\mathbf q_0=T(\mathbf p_0)=w\mathbf a+u\mathbf b+v\mathbf c.
$$

It is projected into the screen plane:

$$
\mathbf q=\mathbf q_0-(\mathbf q_0\cdot \mathbf p)\mathbf p.
$$

If this projected vector is nonzero, the fallback secondary direction is

$$
\mathbf s=\frac{\mathbf q}{\lVert\mathbf q\rVert}.
$$

If the cyclic candidate is degenerate, the camera tries the projected direct
`c` axis, then the projected direct `a` axis. Only if those are also degenerate
does it use a fixed Cartesian fallback. This final step is a last-resort
convention, not a replacement for the crystal-coordinate rule.

The two vectors then determine the whole screen frame. The missing axis is
filled by the right-hand rule. For example, if

$$
\text{primary}=Z,\qquad \text{secondary}=Y,
$$

then

$$
\mathbf{out}=\mathbf p,\qquad \mathbf{up}=\mathbf s,\qquad
\mathbf{right}=\mathbf{up}\times\mathbf{out}.
$$

If instead the primary direction is $X$, the same rule applies with $X$ fixed
and the cyclic next screen axis $Y$ used as the roll-zero anchor. The same
anchor also defines zero angle: changing the angle rotates $\mathbf s$ about the
fixed axis $\mathbf p$.
